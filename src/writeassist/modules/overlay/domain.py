"""Domain models and ports for the floating correction overlay."""

from dataclasses import asdict, dataclass
from typing import Any, Callable, Protocol


@dataclass
class OverlayState:
    """Current state displayed in the floating correction overlay."""

    active_app: str = "Desktop"
    status: str = "ready"  # ready | checking | issues | fixed
    issues_count: int = 0
    last_text: str = ""
    visible: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class OverlayPort(Protocol):
    """Port for controlling the floating desktop overlay."""

    def start(self, actions: dict[str, Callable[[], None]]) -> None:
        ...

    def stop(self) -> None:
        ...

    def update(self, state: OverlayState) -> None:
        ...

    def is_available(self) -> bool:
        ...
