"""Domain protocols and models for system-wide app writing assistance (ZERO I/O)."""

from dataclasses import asdict, dataclass, field
from typing import Any, Protocol


@dataclass
class SystemAssistResult:
    active_app: str
    original_text: str
    improved_text: str
    action: str  # "fix" | "rewrite" | "translate"
    issue_count: int = 0
    success: bool = True
    error_message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ClipboardPort(Protocol):
    """Port interface for accessing system clipboard."""

    def get_text(self) -> str:
        ...

    def set_text(self, text: str) -> bool:
        ...


class ActiveAppPort(Protocol):
    """Port interface for detecting the currently focused OS application."""

    def get_active_app(self) -> str:
        ...


class TextInjectorPort(Protocol):
    """Port interface for copying selection and pasting replacement in focused application."""

    def copy_selection(self) -> str:
        ...

    def paste_text(self, text: str) -> bool:
        ...
