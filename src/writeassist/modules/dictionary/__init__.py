"""Public API boundary for dictionary module."""

from .application import DictionaryService
from .domain import DictionaryPort
from .infrastructure.file_store import FileDictionaryAdapter

__all__ = ["DictionaryPort", "DictionaryService", "FileDictionaryAdapter"]
