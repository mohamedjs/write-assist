"""Domain protocol for server route handling (ZERO I/O)."""

from typing import Any, Protocol


class RouteHandler(Protocol):
    """Protocol for dispatching API calls."""

    def handle(self, method: str, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        ...
