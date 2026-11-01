"""Public API boundary for system_assist module."""

from .application import SystemAssistService
from .domain import ActiveAppPort, ClipboardPort, SystemAssistResult, TextInjectorPort
from .infrastructure.clipboard import OsClipboardAdapter
from .infrastructure.os_bridge import NativeOsBridge

__all__ = [
    "ActiveAppPort",
    "ClipboardPort",
    "NativeOsBridge",
    "OsClipboardAdapter",
    "SystemAssistResult",
    "SystemAssistService",
    "TextInjectorPort",
]
