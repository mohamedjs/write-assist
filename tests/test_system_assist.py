"""Unit tests for system-wide app assistance module."""

from writeassist.modules.system_assist import (
    ActiveAppPort,
    ClipboardPort,
    SystemAssistResult,
    SystemAssistService,
    TextInjectorPort,
)


class MockClipboard(ClipboardPort):
    def __init__(self, initial_text: str = ""):
        self.text = initial_text

    def get_text(self) -> str:
        return self.text

    def set_text(self, text: str) -> bool:
        self.text = text
        return True


class MockOsBridge(ActiveAppPort, TextInjectorPort):
    def __init__(self, app_name: str = "Notes"):
        self.app_name = app_name
        self.copied_text = ""
        self.pasted_text = ""

    def get_active_app(self) -> str:
        return self.app_name

    def copy_selection(self) -> str:
        return self.copied_text

    def paste_text(self, text: str) -> bool:
        self.pasted_text = text
        return True


def test_system_assist_in_place_fix():
    clip = MockClipboard()
    bridge = MockOsBridge(app_name="Notes")
    bridge.copied_text = "Ths is a tst with bad grammar."

    def mock_check(text):
        return {
            "matches": [
                {"message": "Typo", "offset": 0, "length": 3, "replacements": ["This"]},
                {"message": "Typo", "offset": 9, "length": 3, "replacements": ["test"]},
            ]
        }

    service = SystemAssistService(
        clipboard=clip,
        active_app=bridge,
        injector=bridge,
        check_grammar_fn=mock_check,
        rewrite_fn=lambda t, tone: {"rewritten_text": t},
        translate_fn=lambda t, lang: {"translated_text": t},
    )

    result = service.assist_active_app(action="fix", in_place=True)

    assert result.success is True
    assert result.active_app == "Notes"
    assert result.issue_count == 2
    assert bridge.pasted_text == "This is a test with bad grammar."


def test_system_assist_word_excel():
    clip = MockClipboard(initial_text="Dear client we are pleased to inform you.")
    bridge = MockOsBridge(app_name="Microsoft Word")
    bridge.copied_text = ""  # empty selection, falls back to clipboard

    service = SystemAssistService(
        clipboard=clip,
        active_app=bridge,
        injector=bridge,
        check_grammar_fn=lambda t: {"matches": []},
        rewrite_fn=lambda t, tone: {"rewritten_text": f"Professional: {t}"},
        translate_fn=lambda t, lang: {"translated_text": t},
    )

    result = service.assist_active_app(action="rewrite", tone="professional", in_place=False)

    assert result.success is True
    assert result.active_app == "Microsoft Word"
    assert clip.get_text() == "Professional: Dear client we are pleased to inform you."


if __name__ == "__main__":
    test_system_assist_in_place_fix()
    test_system_assist_word_excel()
    print("test_system_assist PASSED")
