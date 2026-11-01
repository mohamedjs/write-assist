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
        if not self._file.exists():
            return Settings()
        try:
            raw = json.loads(self._file.read_text(encoding="utf-8"))
            return Settings.from_dict(raw)
        except Exception:
            return Settings()

    def save(self, settings: Settings) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        self._file.write_text(json.dumps(settings.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
