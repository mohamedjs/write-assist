"""Unit tests for writing assist domain and service."""

from writeassist.modules.assistant import (
    CheckResult,
    GrammarMatch,
    RewriteResult,
    TranslationResult,
    WritingAssistService,
)


class MockGrammarChecker:
    def check(self, text, language="auto", mother_tongue="ar", server_url=""):
        # Match "teh" at offset 0
        matches = []
        if "teh" in text:
            offset = text.index("teh")
            matches.append(
                GrammarMatch(
                    message="Possible spelling mistake",
                    short_message="Spelling",
                    offset=offset,
                    length=3,
                    replacements=["the"],
                    rule_id="MORFOLOGIK_RULE_EN_US",
                    issue_type="spelling",
                )
            )
        return CheckResult(text=text, matches=matches, language="en-US")


class MockLLM:
    def rewrite(self, text, tone, api_key, model):
        return f"Rewritten ({tone}): {text}"

    def fix_sentence(self, sentence, api_key, model):
        return f"Fixed: {sentence}"

    def suggest_replies(self, context, api_key, model):
        return ["Thanks!", "Will check it out.", "Not interested."]


class MockTranslator:
    def translate(self, text, source="auto", target="en"):
        return TranslationResult(original_text=text, translated_text="مرحبا", source_lang="en", target_lang="ar")


def test_dictionary_filtering():
    custom_dict = {"teh"}
    service = WritingAssistService(
        grammar_checker=MockGrammarChecker(),
        gemini_adapter=MockLLM(),
        openrouter_adapter=MockLLM(),
        translator=MockTranslator(),
        is_word_in_dictionary=lambda w: w in custom_dict,
    )

    # With "teh" in dictionary, match should be filtered out
    res = service.check_grammar("teh quick brown fox")
    assert len(res.matches) == 0

    # With empty dictionary, match should appear
    service_no_dict = WritingAssistService(
        grammar_checker=MockGrammarChecker(),
        gemini_adapter=MockLLM(),
        openrouter_adapter=MockLLM(),
        translator=MockTranslator(),
        is_word_in_dictionary=lambda _: False,
    )
    res2 = service_no_dict.check_grammar("teh quick brown fox")
    assert len(res2.matches) == 1
    assert res2.matches[0].replacements == ["the"]


def test_rewrite_and_reply():
    llm = MockLLM()
    service = WritingAssistService(
        grammar_checker=MockGrammarChecker(),
        gemini_adapter=llm,
        openrouter_adapter=llm,
        translator=MockTranslator(),
    )

    rw = service.rewrite("hello world", tone="formal", gemini_key="test-key")
    assert rw.rewritten_text == "Rewritten (formal): hello world"

    replies = service.suggest_replies("Are we meeting today?", gemini_key="test-key")
    assert len(replies.suggestions) == 3


if __name__ == "__main__":
    test_dictionary_filtering()
    test_rewrite_and_reply()
    print("test_assistant PASSED")
