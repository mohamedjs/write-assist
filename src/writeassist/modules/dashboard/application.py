"""Application service for dashboard lifecycle."""

from typing import Any, Callable

from .domain import WindowPort


class DashboardService:
    """Orchestrates dashboard and window launching."""

    def __init__(self, window_launcher: Callable[[str], bool], default_url_provider: Callable[[], str]) -> None:
        self._launcher = window_launcher
        self._url_provider = default_url_provider

    def open(self, url: str | None = None) -> bool:
        target = url or self._url_provider()
        return self._launcher(target)
