"""Cross-platform clipboard adapter for macOS, Windows, and Linux."""

import logging
import shutil
import subprocess
import sys

from ..domain import ClipboardPort

log = logging.getLogger(__name__)


class OsClipboardAdapter(ClipboardPort):
    """Interacts with OS clipboard using platform-native utilities."""

    def get_text(self) -> str:
        # macOS
        if sys.platform == "darwin":
            try:
                res = subprocess.run(["pbpaste"], capture_output=True, text=True, check=True)
                return res.stdout
            except Exception as exc:
                log.debug("pbpaste failed: %s", exc)

        # Linux (Wayland / X11)
        elif sys.platform.startswith("linux"):
            if shutil.which("wl-paste"):
                try:
                    res = subprocess.run(["wl-paste", "--no-newline"], capture_output=True, text=True, check=True)
                    return res.stdout
                except Exception:
                    pass
            if shutil.which("xclip"):
                try:
                    res = subprocess.run(["xclip", "-selection", "clipboard", "-o"], capture_output=True, text=True, check=True)
                    return res.stdout
                except Exception:
                    pass
            if shutil.which("xsel"):
                try:
                    res = subprocess.run(["xsel", "--clipboard", "--output"], capture_output=True, text=True, check=True)
                    return res.stdout
                except Exception:
                    pass

        # Windows
        elif sys.platform.startswith("win32"):
            try:
                cmd = ["powershell", "-NoProfile", "-Command", "Get-Clipboard"]
                res = subprocess.run(cmd, capture_output=True, text=True, check=True)
                return res.stdout.rstrip("\r\n")
            except Exception as exc:
                log.debug("Get-Clipboard failed: %s", exc)

        # Fallback to tkinter if present
        try:
            import tkinter as tk
            r = tk.Tk()
            r.withdraw()
            text = r.clipboard_get()
            r.destroy()
            return text
        except Exception:
            return ""

    def set_text(self, text: str) -> bool:
        # macOS
        if sys.platform == "darwin":
            try:
                p = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
                p.communicate(text.encode("utf-8"))
                return p.returncode == 0
            except Exception as exc:
                log.warning("pbcopy failed: %s", exc)
                return False

        # Linux
        elif sys.platform.startswith("linux"):
            if shutil.which("wl-copy"):
                try:
                    p = subprocess.Popen(["wl-copy"], stdin=subprocess.PIPE)
                    p.communicate(text.encode("utf-8"))
                    return p.returncode == 0
                except Exception:
                    pass
            if shutil.which("xclip"):
                try:
                    p = subprocess.Popen(["xclip", "-selection", "clipboard"], stdin=subprocess.PIPE)
                    p.communicate(text.encode("utf-8"))
                    return p.returncode == 0
                except Exception:
                    pass
            if shutil.which("xsel"):
                try:
                    p = subprocess.Popen(["xsel", "--clipboard", "--input"], stdin=subprocess.PIPE)
                    p.communicate(text.encode("utf-8"))
                    return p.returncode == 0
                except Exception:
                    pass

        # Windows
        elif sys.platform.startswith("win32"):
            try:
                cmd = ["powershell", "-NoProfile", "-Command", "$input | Set-Clipboard"]
                p = subprocess.Popen(cmd, stdin=subprocess.PIPE, text=True)
                p.communicate(text)
                return p.returncode == 0
            except Exception as exc:
                log.warning("Set-Clipboard failed: %s", exc)
                return False

        # Fallback
        try:
            import tkinter as tk
            r = tk.Tk()
            r.withdraw()
            r.clipboard_clear()
            r.clipboard_append(text)
            r.update()
            r.destroy()
            return True
        except Exception:
            return False
