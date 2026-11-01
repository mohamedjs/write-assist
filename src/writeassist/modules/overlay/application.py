"""Application service orchestrating the floating correction overlay."""

import logging
from typing import Callable

from .domain import OverlayPort, OverlayState

log = logging.getLogger(__name__)


class OverlayService:
    """Manages the lifecycle and state of the floating correction overlay."""

    def __init__(
        self,
        port: OverlayPort,
        on_action: dict[str, Callable[[], None]] | None = None,
    ) -> None:
        self._port = port
        self._state = OverlayState()
        self._actions = on_action or {}
        self._running = False

    @property
    def current(self) -> OverlayState:
        return self._state

    def is_available(self) -> bool:
        return self._port.is_available()

    def start(self) -> None:
        if self._running or not self.is_available():
            return
        self._port.start(self._actions)
        self._running = True
        log.info("OverlayService started.")

    def stop(self) -> None:
        if not self._running:
            return
        self._port.stop()
        self._running = False
        log.info("OverlayService stopped.")

    def update_status(
        self,
        active_app: str = "",
        status: str = "ready",
        issues_count: int = 0,
        last_text: str = "",
    ) -> None:
        if active_app:
            self._state.active_app = active_app
        self._state.status = status
        self._state.issues_count = issues_count
        if last_text:
            self._state.last_text = last_text
        self._port.update(self._state)
