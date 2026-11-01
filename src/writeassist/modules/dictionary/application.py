"""Dictionary application service."""

from typing import Callable

from .domain import DictionaryPort


class DictionaryService:
    """Manages personal dictionary words and notifies event handlers."""

    def __init__(self, port: DictionaryPort, on_changed: Callable[[dict[str, list[str]]], None] | None = None) -> None:
        self._port = port
        self._on_changed = on_changed
        self._words: set[str] = self._port.load()

    def get_words(self) -> list[str]:
        return sorted(self._words)

    def contains(self, word: str) -> bool:
        return word.strip().lower() in self._words

    def add_word(self, word: str) -> list[str]:
        w = word.strip().lower()
        if w and w not in self._words:
            self._words.add(w)
            self._port.save(self._words)
            if self._on_changed:
                self._on_changed({"words": self.get_words()})
        return self.get_words()

    def remove_word(self, word: str) -> list[str]:
        w = word.strip().lower()
        if w in self._words:
            self._words.remove(w)
            self._port.save(self._words)
            if self._on_changed:
                self._on_changed({"words": self.get_words()})
        return self.get_words()
