"""Overlay bounded module for floating desktop correction HUD across all monitors and workspaces."""

from .application import OverlayService
from .domain import OverlayPort, OverlayState
from .infrastructure.gtk_backend import GtkOverlayAdapter, is_gtk_available
from .infrastructure.qt_backend import QtOverlayAdapter, is_qt_available


class NullOverlayAdapter(OverlayPort):
    """Fallback no-op adapter when no GUI toolkit is available."""

    def is_available(self) -> bool:
        return False

    def start(self, actions: dict) -> None:
        pass

    def stop(self) -> None:
        pass

    def update(self, state: OverlayState) -> None:
        pass


def create_default_overlay_adapter() -> OverlayPort:
    """Instantiate the best available floating overlay adapter for the host OS."""
    if is_gtk_available():
        return GtkOverlayAdapter()
    if is_qt_available():
        return QtOverlayAdapter()
    return NullOverlayAdapter()


__all__ = [
    "OverlayPort",
    "OverlayService",
    "OverlayState",
    "GtkOverlayAdapter",
    "QtOverlayAdapter",
    "NullOverlayAdapter",
    "create_default_overlay_adapter",
]
