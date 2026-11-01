"""Public API boundary for assistant module."""

from .application import WritingAssistService
from .domain import (
    CheckResult,
    GrammarCheckerPort,
    GrammarMatch,
    LLMPort,
    ReplyResult,
    RewriteResult,
    TranslationResult,
    TranslatorPort,
)
from .infrastructure.gemini import GeminiAdapter
from .infrastructure.languagetool import LanguageToolAdapter
from .infrastructure.openrouter import OpenRouterAdapter
from .infrastructure.translator import GoogleTranslateAdapter

__all__ = [
    "CheckResult",
    "GeminiAdapter",
    "GoogleTranslateAdapter",
    "GrammarCheckerPort",
    "GrammarMatch",
    "LanguageToolAdapter",
    "LLMPort",
    "OpenRouterAdapter",
    "ReplyResult",
    "RewriteResult",
    "TranslationResult",
    "TranslatorPort",
    "WritingAssistService",
]
