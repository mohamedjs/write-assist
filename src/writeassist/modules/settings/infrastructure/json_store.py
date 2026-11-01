"""Concrete filesystem adapter storing settings as JSON."""

import json
from pathlib import Path
from typing import Any

from ..domain import Settings, SettingsPort


class JsonSettingsAdapter(SettingsPort):
    """Stores settings on disk in JSON format."""

    def __init__(self, config_directory: Path) -> None:
        self._dir = config_directory
        self._file = self._dir / "settings.json"

    def load(self) -> Settings:
        settings = Settings()
        if self._file.exists():
            try:
                raw = json.loads(self._file.read_text(encoding="utf-8"))
                settings = Settings.from_dict(raw)
            except Exception:
                settings = Settings()
        if not settings.openrouter_key or not settings.gemini_key:
            lura_keys = Path.home() / ".config" / "lura" / "keys.json"
            if lura_keys.exists():
                try:
                    keys_data = json.loads(lura_keys.read_text(encoding="utf-8"))
                    if not settings.openrouter_key and keys_data.get("openrouter"):
                        settings.openrouter_key = str(keys_data["openrouter"])
                        if settings.ai_provider == "auto":
                            settings.ai_provider = "openrouter"
                    if not settings.gemini_key and keys_data.get("gemini"):
                        settings.gemini_key = str(keys_data["gemini"])
                except Exception:
                    pass
        return settings

    def save(self, settings: Settings) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        self._file.write_text(json.dumps(settings.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
