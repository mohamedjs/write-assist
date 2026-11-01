"""Per-OS standard directories for config, data, cache, and logs."""

import os
from pathlib import Path
import sys

from .platform import IS_MAC, IS_WINDOWS

APP_NAME = "WriteAssist"
SLUG = "writeassist"


def home_dir() -> Path:
    return Path.home()


def config_dir() -> Path:
    if IS_WINDOWS:
        base = os.environ.get("APPDATA") or (home_dir() / "AppData" / "Roaming")
        return Path(base) / APP_NAME
    if IS_MAC:
        return home_dir() / "Library" / "Application Support" / APP_NAME
    xdg = os.environ.get("XDG_CONFIG_HOME") or (home_dir() / ".config")
    return Path(xdg) / SLUG


def data_dir() -> Path:
    if IS_WINDOWS:
        base = os.environ.get("LOCALAPPDATA") or (home_dir() / "AppData" / "Local")
        return Path(base) / APP_NAME
    if IS_MAC:
        return home_dir() / "Library" / "Application Support" / APP_NAME
    xdg = os.environ.get("XDG_DATA_HOME") or (home_dir() / ".local" / "share")
    return Path(xdg) / SLUG


def log_dir() -> Path:
    if IS_WINDOWS:
        return data_dir() / "logs"
    if IS_MAC:
        return home_dir() / "Library" / "Logs" / APP_NAME
    return data_dir() / "logs"


def resource_dir() -> Path:
    """Directory containing static web assets, templates, and locales."""
    if getattr(sys, "frozen", False):
        base = Path(sys._MEIPASS)
        candidate = base / "writeassist"
        return candidate if candidate.exists() else base
    return Path(__file__).resolve().parents[1]
