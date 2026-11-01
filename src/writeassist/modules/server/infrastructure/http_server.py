"""Standard library multithreaded HTTP server with CORS."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import threading
from typing import Any

from ..domain import RouteHandler

log = logging.getLogger(__name__)


class HttpServer:
    """Multithreaded loopback HTTP server."""

    def __init__(self, handler: RouteHandler, host: str = "127.0.0.1", port: int = 43817) -> None:
        self._dispatcher = handler
        self._host = host
        self._port = port
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def port(self) -> int:
        return self._port

    @property
    def url(self) -> str:
        return f"http://{self._host}:{self._port}"

    def start(self) -> None:
        dispatcher = self._dispatcher

        class RequestHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: Any) -> None:
                pass  # suppress default noisy stdout logging

            def _send_cors(self) -> None:
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

            def do_OPTIONS(self) -> None:
                self.send_response(204)
                self._send_cors()
                self.end_headers()

            def do_GET(self) -> None:
                code, resp = dispatcher.handle("GET", self.path, {})
                body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self._send_cors()
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", 0))
                raw_body = self.rfile.read(length) if length > 0 else b"{}"
                try:
                    data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
                except Exception:
                    data = {}

                code, resp = dispatcher.handle("POST", self.path, data)
                body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self._send_cors()
                self.end_headers()
                self.wfile.write(body)

        self._server = ThreadingHTTPServer((self._host, self._port), RequestHandler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True, name="http-server")
        self._thread.start()
        log.info("HTTP Server running at %s", self.url)

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        log.info("HTTP Server stopped")
