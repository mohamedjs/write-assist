"""Pure domain models and protocols for writing assistance (ZERO I/O)."""

from dataclasses import asdict, dataclass, field
from typing import Any, Protocol


@dataclass
class GrammarMatch:
    message: str
    short_message: str
    offset: int
    length: int
    replacements: list[str] = field(default_factory=list)
    rule_id: str = ""
    issue_type: str = "grammar"  # grammar | spelling | style

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CheckResult:
    text: str
    matches: list[GrammarMatch] = field(default_factory=list)
    language: str = "en-US"

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "matches": [m.to_dict() for m in self.matches],
            "language": self.language,
        }


@dataclass
class RewriteResult:
    original_text: str
    rewritten_text: str
    tone: str = "clear"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TranslationResult:
    original_text: str
    translated_text: str
    source_lang: str = "auto"
    target_lang: str = "en"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ReplyResult:
    context: str
    suggestions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class GrammarCheckerPort(Protocol):
    """Port interface for checking text grammar and spelling."""

    def check(self, text: str, language: str = "auto", mother_tongue: str = "ar", server_url: str = "") -> CheckResult:
        ...


class LLMPort(Protocol):
    """Port interface for AI rewrite and generation."""

    def rewrite(self, text: str, tone: str, api_key: str, model: str) -> str:
        ...

    def fix_sentence(self, sentence: str, api_key: str, model: str) -> str:
        ...

    def suggest_replies(self, context: str, api_key: str, model: str) -> list[str]:
        ...


class TranslatorPort(Protocol):
    """Port interface for translating text."""

    def translate(self, text: str, source: str = "auto", target: str = "en") -> TranslationResult:
        ...
