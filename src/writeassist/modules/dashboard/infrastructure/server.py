"""Web dashboard server serving static assets and proxying API endpoints."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
from pathlib import Path
import threading
from typing import Any
import urllib.parse
import urllib.request

from ....shared.paths import resource_dir
from ..domain import WindowPort

log = logging.getLogger(__name__)


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0


def running_url(port: int = 43817) -> str | None:
    """Checks if a WriteAssist instance is already serving at port."""
    url = f"http://127.0.0.1:{port}/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "WriteAssist-Probe"})
        with urllib.request.urlopen(req, timeout=1.0) as res:
            if res.status == 200:
                data = json.loads(res.read().decode("utf-8"))
                if data.get("service") == "WriteAssist":
                    return f"http://127.0.0.1:{port}"
    except Exception:
        pass
    return None


class DashboardServer:
    """Combines static web app hosting and REST API dispatching."""

    MIME_TYPES = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
    }

    def __init__(self, api_dispatcher: Any, port: int = 43817, host: str = "127.0.0.1") -> None:
        self._api = api_dispatcher
        self._port = port
        self._host = host
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._static_dir = resource_dir() / "modules" / "dashboard" / "infrastructure" / "static"
        if not self._static_dir.exists():
            self._static_dir = Path(__file__).parent / "static"

    @property
    def url(self) -> str:
        return f"http://{self._host}:{self._port}"

    def start(self) -> None:
        static_dir = self._static_dir
        mime_types = self.MIME_TYPES
        api = self._api

        class DashboardHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: Any) -> None:
                pass

            def _send_cors(self) -> None:
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

            def do_OPTIONS(self) -> None:
                self.send_response(204)
                self._send_cors()
                self.end_headers()

            def do_GET(self) -> None:
                clean = urllib.parse.urlparse(self.path).path

                # API routes
                if clean.startswith("/api/") or clean == "/health":
                    code, resp = api.handle("GET", self.path, {})
                    body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
                    self.send_response(code)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(body)
                    return

                # Static files
                rel = clean.lstrip("/") or "index.html"
                target = (static_dir / rel).resolve()

                if not str(target).startswith(str(static_dir.resolve())) or not target.is_file():
                    target = static_dir / "index.html"

                if target.exists() and target.is_file():
                    content = target.read_bytes()
                    ext = target.suffix.lower()
                    mime = mime_types.get(ext, "application/octet-stream")
                    self.send_response(200)
                    self.send_header("Content-Type", mime)
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Cache-Control", "no-cache")
                    self._send_cors()
                    self.end_headers()
                    self.wfile.write(content)
                else:
                    self.send_response(404)
                    self.end_headers()

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", 0))
                raw_body = self.rfile.read(length) if length > 0 else b"{}"
                try:
                    data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
                except Exception:
                    data = {}

                code, resp = api.handle("POST", self.path, data)
                body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self._send_cors()
                self.end_headers()
                self.wfile.write(body)

        self._server = ThreadingHTTPServer((self._host, self._port), DashboardHandler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True, name="dashboard-server")
        self._thread.start()
        log.info("Dashboard server listening at %s", self.url)

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        log.info("Dashboard server stopped")
