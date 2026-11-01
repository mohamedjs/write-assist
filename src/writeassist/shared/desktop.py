"""OS autostart registration and binary resolution."""

from pathlib import Path
import shutil
import subprocess
import sys

from .paths import config_dir, home_dir
from .platform import FROZEN, IS_LINUX, IS_MAC, IS_WINDOWS


def launch_command() -> list[str]:
    """Executable command line to start writeassist."""
    if FROZEN:
        return [sys.executable]
    return [sys.executable, "-m", "writeassist.app"]


def apply_autostart(enable: bool) -> bool:
    """Register or deregister the app from launching at user login."""
    if IS_WINDOWS:
        try:
            import winreg

            key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
                if enable:
                    cmd = f'"{sys.executable}" run --no-window'
                    winreg.SetValueEx(key, "WriteAssist", 0, winreg.REG_SZ, cmd)
                else:
                    try:
                        winreg.DeleteValue(key, "WriteAssist")
                    except FileNotFoundError:
                        pass
            return True
        except Exception:
            return False

    if IS_MAC:
        plist_path = home_dir() / "Library" / "LaunchAgents" / "com.mohamedjs.writeassist.plist"
        if not enable:
            if plist_path.exists():
                subprocess.run(["launchctl", "unload", str(plist_path)], check=False, capture_output=True)
                plist_path.unlink(missing_ok=True)
            return True

        plist_path.parent.mkdir(parents=True, exist_ok=True)
        exe = sys.executable
        plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mohamedjs.writeassist</string>
    <key>ProgramArguments</key>
    <array>
        <string>{exe}</string>
        <string>run</string>
        <string>--no-window</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>"""
        plist_path.write_text(plist, encoding="utf-8")
        subprocess.run(["launchctl", "load", str(plist_path)], check=False, capture_output=True)
        return True

    if IS_LINUX:
        # XDG autostart
        autostart_dir = config_dir().parent / "autostart"
        autostart_file = autostart_dir / "writeassist.desktop"
        if not enable:
            autostart_file.unlink(missing_ok=True)
            return True

        autostart_dir.mkdir(parents=True, exist_ok=True)
        exec_cmd = "writeassist run --no-window" if shutil.which("writeassist") else f"{sys.executable} run --no-window"
        entry = f"""[Desktop Entry]
Type=Application
Name=WriteAssist
Comment=Writing Assistant Background Service
Exec={exec_cmd}
Terminal=false
Categories=Utility;Office;
"""
        autostart_file.write_text(entry, encoding="utf-8")
        return True

    return False
