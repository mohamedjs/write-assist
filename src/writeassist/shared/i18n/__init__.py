"""Internationalization helpers for WriteAssist."""

import json
from pathlib import Path
from typing import Any

from ..paths import resource_dir

_TRANSLATIONS: dict[str, dict[str, str]] = {}


def _load_lang(lang: str) -> dict[str, str]:
    if lang in _TRANSLATIONS:
        return _TRANSLATIONS[lang]
    path = resource_dir() / "shared" / "i18n" / f"{lang}.json"
    if not path.exists():
        path = Path(__file__).parent / f"{lang}.json"
    if path.exists():
        try:
            _TRANSLATIONS[lang] = json.loads(path.read_text(encoding="utf-8"))
            return _TRANSLATIONS[lang]
        except Exception:
            pass
    return {}


def t(key: str, lang: str = "en", vars: dict[str, Any] | None = None) -> str:
    strings = _load_lang(lang) or _load_lang("en")
    val = strings.get(key, key)
    if vars:
        for k, v in vars.items():
            val = val.replace(f"{{{k}}}", str(v))
    return val
