"""Application service for system-wide app writing assistance."""

import logging
import threading
import time
from typing import Any, Callable

from .domain import ActiveAppPort, ClipboardPort, SystemAssistResult, TextInjectorPort

log = logging.getLogger(__name__)


class SystemAssistService:
    """Orchestrates writing assistance across all OS desktop applications."""

    def __init__(
        self,
        clipboard: ClipboardPort,
        active_app: ActiveAppPort,
        injector: TextInjectorPort,
        check_grammar_fn: Callable[[str], dict[str, Any]],
        rewrite_fn: Callable[[str, str], dict[str, Any]],
        translate_fn: Callable[[str, str], dict[str, Any]],
        on_assisted: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._clip = clipboard
        self._app = active_app
        self._injector = injector
        self._check_grammar = check_grammar_fn
        self._rewrite = rewrite_fn
        self._translate = translate_fn
        self._on_assisted = on_assisted
        self._watcher_stop = threading.Event()
        self._watcher_thread: threading.Thread | None = None

    def assist_active_app(
        self,
        action: str = "fix",  # "fix" | "rewrite" | "translate"
        tone: str = "clear",
        target_lang: str = "en",
        in_place: bool = True,
    ) -> SystemAssistResult:
        app_name = self._app.get_active_app()
        raw_text = self._injector.copy_selection()

        if not raw_text or not raw_text.strip():
            # Fall back to current clipboard text
            raw_text = self._clip.get_text()

        if not raw_text or not raw_text.strip():
            return SystemAssistResult(
                active_app=app_name,
                original_text="",
                improved_text="",
                action=action,
                success=False,
                error_message="No text found in active application or clipboard.",
            )

        improved = raw_text
        issue_count = 0

        try:
            if action == "fix":
                res = self._check_grammar(raw_text)
                matches = res.get("matches", [])
                issue_count = len(matches)
                # Apply fixes from end to start to preserve offsets
                sorted_matches = sorted(matches, key=lambda m: m.get("offset", 0), reverse=True)
                for m in sorted_matches:
                    reps = m.get("replacements", [])
                    if reps:
                        off = m["offset"]
                        ln = m["length"]
                        improved = improved[:off] + reps[0] + improved[off + ln :]

            elif action == "rewrite":
                res = self._rewrite(raw_text, tone)
                improved = res.get("rewritten_text", raw_text) or raw_text

            elif action == "translate":
                res = self._translate(raw_text, target_lang)
                improved = res.get("translated_text", raw_text) or raw_text

            # If in-place replacement requested, paste back into active app
            if in_place and improved != raw_text:
                self._injector.paste_text(improved)
            else:
                self._clip.set_text(improved)

            result = SystemAssistResult(
                active_app=app_name,
                original_text=raw_text,
                improved_text=improved,
                action=action,
                issue_count=issue_count,
                success=True,
            )

            if self._on_assisted:
                self._on_assisted(result.to_dict())

            return result

        except Exception as exc:
            log.warning("System assist failed in app %s: %s", app_name, exc)
            return SystemAssistResult(
                active_app=app_name,
                original_text=raw_text,
                improved_text=raw_text,
                action=action,
                success=False,
                error_message=str(exc),
            )

    def start_watcher(self, on_change: Callable[[str, str], None] | None = None) -> None:
        """Starts background watcher monitoring clipboard updates across apps."""
        if self._watcher_thread and self._watcher_thread.is_alive():
            return

        self._watcher_stop.clear()

        def loop():
            last_text = self._clip.get_text()
            while not self._watcher_stop.is_set():
                time.sleep(0.8)
                current = self._clip.get_text()
                if current and current != last_text and len(current.strip()) > 3:
                    last_text = current
                    app = self._app.get_active_app()
                    if on_change:
                        on_change(app, current)

        self._watcher_thread = threading.Thread(target=loop, daemon=True, name="system-assist-watcher")
        self._watcher_thread.start()

    def stop_watcher(self) -> None:
        self._watcher_stop.set()
        if self._watcher_thread:
            self._watcher_thread.join(timeout=2)
            self._watcher_thread = None
