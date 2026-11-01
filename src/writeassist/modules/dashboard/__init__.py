"""Public API boundary for dashboard module."""

from .application import DashboardService
from .domain import WindowPort
from .infrastructure.server import DashboardServer, running_url
from .infrastructure.window import app_window_or_browser, open_fallback_browser, show_window

__all__ = [
    "DashboardServer",
    "DashboardService",
    "WindowPort",
    "app_window_or_browser",
    "open_fallback_browser",
    "running_url",
    "show_window",
]
