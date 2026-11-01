"""OS bridge detecting active desktop apps and simulating copy/paste operations."""

import logging
import shutil
import subprocess
import sys
import time

from ..domain import ActiveAppPort, TextInjectorPort
from .clipboard import OsClipboardAdapter

log = logging.getLogger(__name__)


class NativeOsBridge(ActiveAppPort, TextInjectorPort):
    """Bridge for detecting active desktop applications and replacing text in-place."""

    def __init__(self, clipboard: OsClipboardAdapter | None = None) -> None:
        self._clip = clipboard or OsClipboardAdapter()

    def get_active_app(self) -> str:
        # macOS: query System Events
        if sys.platform == "darwin":
            try:
                script = 'tell application "System Events" to get name of first application process whose frontmost is true'
                res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, check=True)
                name = res.stdout.strip()
                if name:
                    return name
            except Exception as exc:
                log.debug("macOS active app query failed: %s", exc)

        # Linux: query xdotool / xprop
        elif sys.platform.startswith("linux"):
            if shutil.which("xdotool"):
                try:
                    wid = subprocess.run(["xdotool", "getactivewindow"], capture_output=True, text=True, check=True).stdout.strip()
                    if wid:
                        wname = subprocess.run(["xdotool", "getwindowname", wid], capture_output=True, text=True).stdout.strip()
                        return wname or "Linux Desktop App"
                except Exception:
                    pass

        # Windows: query via powershell
        elif sys.platform.startswith("win32"):
            try:
                ps = (
                    "Add-Type '@\nusing System;\nusing System.Runtime.InteropServices;\n"
                    "public class W { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); }\n@'; "
                    "$h = [W]::GetForegroundWindow(); "
                    "(Get-Process | Where-Object { $_.MainWindowHandle -eq $h }).ProcessName"
                )
                res = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, check=True)
                app = res.stdout.strip()
                if app:
                    return app
            except Exception as exc:
                log.debug("Windows active app query failed: %s", exc)

        return "Active Desktop App"

    def copy_selection(self) -> str:
        """Triggers copy keystroke in active application and returns clipboard text."""
        # 1. Trigger Cmd+C on macOS or Ctrl+C on Linux/Windows
        if sys.platform == "darwin":
            try:
                script = 'tell application "System Events" to keystroke "c" using {command down}'
                subprocess.run(["osascript", "-e", script], check=True, capture_output=True)
                time.sleep(0.08)
            except Exception as exc:
                log.debug("macOS copy simulation failed: %s", exc)
        elif sys.platform.startswith("linux") and shutil.which("xdotool"):
            try:
                subprocess.run(["xdotool", "key", "--clearmodifiers", "ctrl+c"], check=True, capture_output=True)
                time.sleep(0.08)
            except Exception:
                pass
        elif sys.platform.startswith("win32"):
            try:
                vbs = '$ws = New-Object -ComObject wscript.shell; $ws.SendKeys("^c")'
                subprocess.run(["powershell", "-NoProfile", "-Command", vbs], capture_output=True)
                time.sleep(0.08)
            except Exception:
                pass

        return self._clip.get_text()

    def paste_text(self, text: str) -> bool:
        """Puts improved text onto clipboard and triggers paste keystroke into active app."""
        if not self._clip.set_text(text):
            return False

        time.sleep(0.05)

        # Trigger Cmd+V on macOS or Ctrl+V on Linux/Windows
        if sys.platform == "darwin":
            try:
                script = 'tell application "System Events" to keystroke "v" using {command down}'
                subprocess.run(["osascript", "-e", script], check=True, capture_output=True)
                return True
            except Exception as exc:
                log.warning("macOS paste simulation failed: %s", exc)
                return False
        elif sys.platform.startswith("linux") and shutil.which("xdotool"):
            try:
                subprocess.run(["xdotool", "key", "--clearmodifiers", "ctrl+v"], check=True, capture_output=True)
                return True
            except Exception:
                return False
        elif sys.platform.startswith("win32"):
            try:
                vbs = '$ws = New-Object -ComObject wscript.shell; $ws.SendKeys("^v")'
                subprocess.run(["powershell", "-NoProfile", "-Command", vbs], capture_output=True)
                return True
            except Exception:
                return False

        return True
