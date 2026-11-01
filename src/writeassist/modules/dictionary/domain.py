"""Domain protocol for user dictionary (ZERO I/O)."""

from typing import Protocol


class DictionaryPort(Protocol):
    """Port interface for loading and saving custom words."""

    def load(self) -> set[str]:
        ...

    def save(self, words: set[str]) -> None:
        ...
