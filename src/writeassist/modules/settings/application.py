"""Settings application service orchestrating updates and notifications."""

from typing import Any, Callable

from .domain import Settings, SettingsPort


class SettingsService:
    """Application use cases for managing settings."""

    def __init__(self, port: SettingsPort, on_changed: Callable[[dict[str, Any]], None] | None = None) -> None:
        self._port = port
        self._on_changed = on_changed
        self._current: Settings = self._port.load()

    @property
    def current(self) -> Settings:
        return self._current

    def update(self, changes: dict[str, Any]) -> Settings:
        new_data = self._current.to_dict()
        new_data.update(changes)
        updated = Settings.from_dict(new_data)
        self._port.save(updated)
        old_settings = self._current
        self._current = updated
        if self._on_changed:
            self._on_changed({"previous": old_settings.to_dict(), "current": updated.to_dict(), "changes": changes})
        return updated
