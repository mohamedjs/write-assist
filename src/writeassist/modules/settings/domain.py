"""Pure domain models and Port interface for settings (ZERO I/O)."""

from dataclasses import asdict, dataclass
from typing import Any, Protocol


@dataclass
class Settings:
    port: int = 43817
    ui_language: str = "en"
    theme: str = "auto"
    auto_check: bool = True
    lt_server: str = "https://api.languagetool.org"
    lt_language: str = "auto"
    mother_tongue: str = "ar"
    ai_provider: str = "auto"  # auto | gemini | openrouter
    gemini_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    openrouter_key: str = ""
    openrouter_model: str = "openrouter/auto"
    translate_target: str = "en"
    start_at_login: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Settings":
        valid_keys = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


class SettingsPort(Protocol):
    """Port for persisting and retrieving user settings."""

    def load(self) -> Settings:
        ...

    def save(self, settings: Settings) -> None:
        ...
