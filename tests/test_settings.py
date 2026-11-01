"""Unit tests for settings domain, storage, and service."""

from pathlib import Path
import tempfile

from writeassist.modules.settings import JsonSettingsAdapter, Settings, SettingsService


def test_settings_defaults():
    s = Settings()
    assert s.port == 43817
    assert s.lt_server == "https://api.languagetool.org"
    assert s.ai_provider == "auto"
    assert s.to_dict()["port"] == 43817


def test_settings_persistence():
    with tempfile.TemporaryDirectory() as tmp:
        store = JsonSettingsAdapter(Path(tmp))
        service = SettingsService(store)

        assert service.current.port == 43817
        service.update({"port": 49999, "theme": "dark"})

        assert service.current.port == 49999
        assert service.current.theme == "dark"

        # Reload from disk
        store2 = JsonSettingsAdapter(Path(tmp))
        loaded = store2.load()
        assert loaded.port == 49999
        assert loaded.theme == "dark"


if __name__ == "__main__":
    test_settings_defaults()
    test_settings_persistence()
    print("test_settings PASSED")
