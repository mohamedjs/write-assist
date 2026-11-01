"""Test runner executing all test suites."""

import sys
from pathlib import Path

# Add src to sys.path so tests run cleanly in any environment
SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import test_architecture
import test_settings
import test_assistant
import test_server
import test_system_assist
import test_overlay


def main() -> int:
    suites = [
        ("Architecture Boundaries", test_architecture.main),
        ("Settings Suite", lambda: (test_settings.test_settings_defaults(), test_settings.test_settings_persistence(), 0)[2]),
        ("Assistant Suite", lambda: (test_assistant.test_dictionary_filtering(), test_assistant.test_rewrite_and_reply(), 0)[2]),
        ("Server API Suite", lambda: (test_server.test_api_dispatcher(), 0)[1]),
        ("System Assist Suite", lambda: (test_system_assist.test_system_assist_in_place_fix(), test_system_assist.test_system_assist_word_excel(), 0)[2]),
        ("Floating Overlay Suite", lambda: (test_overlay.test_overlay_state(), test_overlay.test_overlay_service_with_null_adapter(), test_overlay.test_default_adapter_creation(), 0)[3]),
    ]

    failed = False
    print("=" * 60)
    print(" Running WriteAssist Test Suites")
    print("=" * 60)

    for name, runner in suites:
        try:
            res = runner()
            if res == 0 or res is None:
                print(f" [PASS] {name}")
            else:
                print(f" [FAIL] {name} (exit code {res})")
                failed = True
        except Exception as exc:
            print(f" [FAIL] {name}: {exc}")
            failed = True

    print("=" * 60)
    if failed:
        print(" Some tests failed!")
        return 1
    print(" All test suites PASSED successfully!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
