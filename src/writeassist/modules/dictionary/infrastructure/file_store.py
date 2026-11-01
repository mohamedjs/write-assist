"""Filesystem plain text adapter for user dictionary."""

from pathlib import Path

from ..domain import DictionaryPort


class FileDictionaryAdapter(DictionaryPort):
    """Saves dictionary words one per line in a text file."""

    def __init__(self, data_directory: Path) -> None:
        self._dir = data_directory
        self._file = self._dir / "dictionary.txt"

    def load(self) -> set[str]:
        if not self._file.exists():
            return set()
        try:
            lines = self._file.read_text(encoding="utf-8").splitlines()
            return {line.strip().lower() for line in lines if line.strip()}
        except Exception:
            return set()

    def save(self, words: set[str]) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        content = "\n".join(sorted(words)) + "\n"
        self._file.write_text(content, encoding="utf-8")
