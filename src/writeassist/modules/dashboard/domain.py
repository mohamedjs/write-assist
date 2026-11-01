"""Domain protocols for desktop window and dashboard (ZERO I/O)."""

from typing import Protocol


class WindowPort(Protocol):
    """Port interface for launching desktop window."""

    def open(self, url: str) -> bool:
        ...
