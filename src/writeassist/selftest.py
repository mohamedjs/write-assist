"""System doctor and diagnostics verifier."""

from dataclasses import asdict, dataclass
import shutil
import socket
import sys
import urllib.request

from .shared import paths
from .shared.platform import IS_LINUX, IS_MAC, IS_WINDOWS


@dataclass
class CheckResult:
    name: str
    status: str  # "PASS" | "WARN" | "FAIL"
    detail: str

    def to_dict(self):
        return asdict(self)


def run_checks(settings=None) -> list[CheckResult]:
    results: list[CheckResult] = []

    # 1. Python environment
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    results.append(CheckResult("Python Runtime", "PASS", f"Python {py_ver} ({sys.platform})"))

    # 2. Local writable directory
    try:
        paths.config_dir().mkdir(parents=True, exist_ok=True)
        paths.data_dir().mkdir(parents=True, exist_ok=True)
        test_file = paths.data_dir() / ".doctor_test"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
        results.append(CheckResult("Storage Permissions", "PASS", f"Config & Data writable at {paths.data_dir()}"))
    except Exception as exc:
        results.append(CheckResult("Storage Permissions", "FAIL", f"Cannot write to data dir: {exc}"))

    # 3. Port check
    port = settings.port if settings else 43817
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        busy = s.connect_ex(("127.0.0.1", port)) == 0
    if busy:
        results.append(CheckResult(f"Port {port}", "WARN", "Port is currently in use (possibly by running WriteAssist)"))
    else:
        results.append(CheckResult(f"Port {port}", "PASS", "Port is available for local loopback"))

    # 4. LanguageTool API reachability
    lt_server = (settings.lt_server if settings else "https://api.languagetool.org").rstrip("/")
    try:
        req = urllib.request.Request(f"{lt_server}/v2/languages", headers={"User-Agent": "WriteAssist-Doctor/1.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                results.append(CheckResult("LanguageTool API", "PASS", f"Reachable at {lt_server}"))
            else:
                results.append(CheckResult("LanguageTool API", "WARN", f"Returned HTTP {res.status}"))
    except Exception as exc:
        results.append(CheckResult("LanguageTool API", "WARN", f"Could not reach {lt_server}: {exc}"))

    # 5. Native Browser / Window engine
    found_browsers = []
    candidates = ["google-chrome", "google-chrome-stable", "chromium", "microsoft-edge", "brave-browser"]
    if IS_WINDOWS:
        candidates = ["msedge.exe", "chrome.exe", "brave.exe"]
    for c in candidates:
        if shutil.which(c):
            found_browsers.append(c)
    if found_browsers:
        results.append(CheckResult("Desktop Window Backend", "PASS", f"Found Chromium engine: {found_browsers[0]}"))
    else:
        results.append(CheckResult("Desktop Window Backend", "PASS", "Will use system default web browser fallback"))

    # 6. AI Provider Keys
    if settings and settings.gemini_key.strip():
        results.append(CheckResult("Gemini AI API Key", "PASS", "Configured"))
    elif settings and settings.openrouter_key.strip():
        results.append(CheckResult("OpenRouter API Key", "PASS", "Configured"))
    else:
        results.append(CheckResult("AI Rewrite & Reply", "WARN", "No API key configured (grammar check still works without keys)"))

    return results


def print_doctor(settings=None) -> int:
    checks = run_checks(settings)
    failed = False
    print("\n--- WriteAssist Doctor & System Diagnostics ---\n")
    for chk in checks:
        badge = f"[{chk.status}]"
        print(f"  {badge:<8} {chk.name:<24} : {chk.detail}")
        if chk.status == "FAIL":
            failed = True
    print("\n")
    return 1 if failed else 0
