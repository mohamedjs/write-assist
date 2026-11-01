"""Native desktop app window launcher with crash reaper and browser fallback."""

import logging
import os
from pathlib import Path
import shutil
import subprocess
import sys
import webbrowser

from ....shared.paths import data_dir, resource_dir
from ....shared.platform import IS_MAC, IS_WINDOWS

log = logging.getLogger(__name__)

TITLE = "WriteAssist"
SIZE = (1220, 880)


def _chromium_family() -> list[str]:
    if IS_WINDOWS:
        roots = [os.environ.get(v, "") for v in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA")]
        rel = (
            "Microsoft/Edge/Application/msedge.exe",
            "Google/Chrome/Application/chrome.exe",
            "BraveSoftware/Brave-Browser/Application/brave.exe",
        )
        return [str(Path(r) / p) for r in roots if r for p in rel if (Path(r) / p).exists()]

    if IS_MAC:
        apps = ("Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium")
        return [
            f"/Applications/{a}.app/Contents/MacOS/{a}"
            for a in apps
            if Path(f"/Applications/{a}.app/Contents/MacOS/{a}").exists()
        ]

    names = (
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "microsoft-edge-stable",
        "brave-browser",
    )
    return [p for n in names if (p := shutil.which(n))]


def open_fallback_browser(url: str) -> None:
    """Opens system browser when native window fails."""
    try:
        webbrowser.open(url)
    except Exception as exc:
        log.warning("Failed to open default browser: %s", exc)


def app_window_or_browser(url: str) -> bool:
    """Launch chromeless browser window via --app mode, falling back to default browser."""
    profile_dir = data_dir() / "window-profile"
    profile_dir.mkdir(parents=True, exist_ok=True)

    for browser in _chromium_family():
        try:
            kwargs = {}
            if not IS_WINDOWS:
                kwargs["start_new_session"] = True
            child = subprocess.Popen(
                [
                    browser,
                    f"--app={url}",
                    f"--window-size={SIZE[0]},{SIZE[1]}",
                    f"--user-data-dir={profile_dir}",
                    "--no-first-run",
                    "--no-default-browser-check",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                **kwargs,
            )
            return True
        except Exception:
            continue

    open_fallback_browser(url)
    return False


def show_window(url: str) -> None:
    """Open desktop window and block until closed, with automatic crash fallback."""
    # Try pywebview if installed
    try:
        import webview

        storage = data_dir() / "webview"
        storage.mkdir(parents=True, exist_ok=True)
        webview.create_window(
            TITLE,
            url,
            width=SIZE[0],
            height=SIZE[1],
            min_size=(420, 560),
            background_color="#0f172a",
            text_select=True,
        )
        webview.start(private_mode=False, storage_path=str(storage))
        return
    except Exception as exc:
        log.info("pywebview unavailable (%s); using app-mode browser window.", exc)

    app_window_or_browser(url)
