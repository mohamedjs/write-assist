"""Application service coordinating grammar checking, rewriting, and translating."""

from typing import Callable

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


class WritingAssistService:
    """Use-case service for writing assistance."""

    def __init__(
        self,
        grammar_checker: GrammarCheckerPort,
        gemini_adapter: LLMPort,
        openrouter_adapter: LLMPort,
        translator: TranslatorPort,
        is_word_in_dictionary: Callable[[str], bool] | None = None,
    ) -> None:
        self._grammar_checker = grammar_checker
        self._gemini = gemini_adapter
        self._openrouter = openrouter_adapter
        self._translator = translator
        self._is_in_dict = is_word_in_dictionary or (lambda _: False)

    def check_grammar(
        self,
        text: str,
        language: str = "auto",
        mother_tongue: str = "ar",
        server_url: str = "",
    ) -> CheckResult:
        if not text or not text.strip():
            return CheckResult(text=text, matches=[], language=language)

        raw_result = self._grammar_checker.check(
            text=text,
            language=language,
            mother_tongue=mother_tongue,
            server_url=server_url,
        )

        # Filter out matches for words present in the user's personal dictionary
        filtered_matches: list[GrammarMatch] = []
        for m in raw_result.matches:
            matched_segment = text[m.offset : m.offset + m.length]
            if not self._is_in_dict(matched_segment):
                filtered_matches.append(m)

        return CheckResult(text=text, matches=filtered_matches, language=raw_result.language)

    def rewrite(
        self,
        text: str,
        tone: str = "clear",
        provider: str = "auto",
        gemini_key: str = "",
        gemini_model: str = "gemini-2.5-flash",
        openrouter_key: str = "",
        openrouter_model: str = "openrouter/auto",
    ) -> RewriteResult:
        if not text or not text.strip():
            return RewriteResult(original_text=text, rewritten_text="", tone=tone)

        rewritten = ""
        # Auto-selection or explicit provider
        use_gemini = (provider == "gemini" or (provider == "auto" and gemini_key.strip()))
        if use_gemini and gemini_key.strip():
            rewritten = self._gemini.rewrite(text, tone, gemini_key.strip(), gemini_model)
        elif openrouter_key.strip():
            rewritten = self._openrouter.rewrite(text, tone, openrouter_key.strip(), openrouter_model)
        elif gemini_key.strip():
            rewritten = self._gemini.rewrite(text, tone, gemini_key.strip(), gemini_model)
        else:
            rewritten = (
                "Please configure a free Gemini API key (or OpenRouter key) in Settings to enable AI rewriting."
            )

        return RewriteResult(original_text=text, rewritten_text=rewritten.strip(), tone=tone)

    def fix_sentence(
        self,
        sentence: str,
        provider: str = "auto",
        gemini_key: str = "",
        gemini_model: str = "gemini-2.5-flash",
        openrouter_key: str = "",
        openrouter_model: str = "openrouter/auto",
    ) -> str:
        if not sentence or not sentence.strip():
            return sentence

        use_gemini = (provider == "gemini" or (provider == "auto" and gemini_key.strip()))
        if use_gemini and gemini_key.strip():
            return self._gemini.fix_sentence(sentence, gemini_key.strip(), gemini_model)
        if openrouter_key.strip():
            return self._openrouter.fix_sentence(sentence, openrouter_key.strip(), openrouter_model)
        return sentence

    def suggest_replies(
        self,
        context: str,
        provider: str = "auto",
        gemini_key: str = "",
        gemini_model: str = "gemini-2.5-flash",
        openrouter_key: str = "",
        openrouter_model: str = "openrouter/auto",
    ) -> ReplyResult:
        if not context or not context.strip():
            return ReplyResult(context=context, suggestions=[])

        suggestions: list[str] = []
        use_gemini = (provider == "gemini" or (provider == "auto" and gemini_key.strip()))
        if use_gemini and gemini_key.strip():
            suggestions = self._gemini.suggest_replies(context, gemini_key.strip(), gemini_model)
        elif openrouter_key.strip():
            suggestions = self._openrouter.suggest_replies(context, openrouter_key.strip(), openrouter_model)

        return ReplyResult(context=context, suggestions=suggestions)

    def translate(self, text: str, source: str = "auto", target: str = "en") -> TranslationResult:
        if not text or not text.strip():
            return TranslationResult(original_text=text, translated_text="", source_lang=source, target_lang=target)
        return self._translator.translate(text, source, target)
