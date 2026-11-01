"""Composition root — the ONLY file allowed to instantiate adapters and wire modules."""

from dataclasses import dataclass

from .modules.assistant import (
    GeminiAdapter,
    GoogleTranslateAdapter,
    LanguageToolAdapter,
    OpenRouterAdapter,
    WritingAssistService,
)
from .modules.dashboard import (
    DashboardServer,
    DashboardService,
    app_window_or_browser,
    show_window,
)
from .modules.dictionary import DictionaryService, FileDictionaryAdapter
from .modules.overlay import OverlayService, create_default_overlay_adapter
from .modules.server import ApiDispatcher, HttpServer
from .modules.settings import JsonSettingsAdapter, Settings, SettingsService
from .modules.system_assist import NativeOsBridge, OsClipboardAdapter, SystemAssistService
from .selftest import run_checks
from .shared import events, paths


@dataclass
class Container:
    bus: events.EventBus
    settings: SettingsService
    dictionary: DictionaryService
    assistant: WritingAssistService
    dispatcher: ApiDispatcher
    server: DashboardServer
    dashboard: DashboardService
    system_assist: SystemAssistService
    overlay: OverlayService


def build() -> Container:
    """Build and wire all modules and adapters."""
    bus = events.EventBus()

    # 1. Settings Module
    settings_store = JsonSettingsAdapter(paths.config_dir())
    settings_service = SettingsService(
        port=settings_store,
        on_changed=lambda data: bus.publish(events.SETTINGS_CHANGED, data),
    )

    # 2. Dictionary Module
    dict_store = FileDictionaryAdapter(paths.data_dir())
    dict_service = DictionaryService(
        port=dict_store,
        on_changed=lambda data: bus.publish(events.DICTIONARY_UPDATED, data),
    )

    # 3. Assistant Module
    lt_adapter = LanguageToolAdapter()
    gemini_adapter = GeminiAdapter()
    openrouter_adapter = OpenRouterAdapter()
    translate_adapter = GoogleTranslateAdapter()

    assistant_service = WritingAssistService(
        grammar_checker=lt_adapter,
        gemini_adapter=gemini_adapter,
        openrouter_adapter=openrouter_adapter,
        translator=translate_adapter,
        is_word_in_dictionary=dict_service.contains,
    )

    # 4. REST API Dispatcher
    def api_check_grammar(text: str, language: str = "auto", mother_tongue: str = "ar", server_url: str = ""):
        cfg = settings_service.current
        srv = server_url or cfg.lt_server
        lang = language if language != "auto" else cfg.lt_language
        mt = mother_tongue or cfg.mother_tongue
        res = assistant_service.check_grammar(text, language=lang, mother_tongue=mt, server_url=srv)
        bus.publish(events.CHECK_COMPLETED, {"count": len(res.matches)})
        return res.to_dict()

    def api_rewrite(text: str, tone: str = "clear", provider: str = "auto"):
        cfg = settings_service.current
        p = provider if provider != "auto" else cfg.ai_provider
        res = assistant_service.rewrite(
            text=text,
            tone=tone,
            provider=p,
            gemini_key=cfg.gemini_key,
            gemini_model=cfg.gemini_model,
            openrouter_key=cfg.openrouter_key,
            openrouter_model=cfg.openrouter_model,
        )
        return res.to_dict()

    def api_fix_sentence(sentence: str, provider: str = "auto") -> str:
        cfg = settings_service.current
        p = provider if provider != "auto" else cfg.ai_provider
        return assistant_service.fix_sentence(
            sentence=sentence,
            provider=p,
            gemini_key=cfg.gemini_key,
            gemini_model=cfg.gemini_model,
            openrouter_key=cfg.openrouter_key,
            openrouter_model=cfg.openrouter_model,
        )

    def api_suggest_replies(context: str, provider: str = "auto"):
        cfg = settings_service.current
        p = provider if provider != "auto" else cfg.ai_provider
        res = assistant_service.suggest_replies(
            context=context,
            provider=p,
            gemini_key=cfg.gemini_key,
            gemini_model=cfg.gemini_model,
            openrouter_key=cfg.openrouter_key,
            openrouter_model=cfg.openrouter_model,
        )
        return res.to_dict()

    def api_translate(text: str, source: str = "auto", target: str = "en"):
        cfg = settings_service.current
        t = target or cfg.translate_target
        res = assistant_service.translate(text=text, source=source, target=t)
        return res.to_dict()

    def api_run_doctor():
        checks = run_checks(settings_service.current)
        return {"checks": [c.to_dict() for c in checks]}

    dispatcher = ApiDispatcher(
        get_settings=lambda: settings_service.current.to_dict(),
        update_settings=lambda changes: settings_service.update(changes).to_dict(),
        get_dictionary=dict_service.get_words,
        add_dictionary_word=dict_service.add_word,
        remove_dictionary_word=dict_service.remove_word,
        check_grammar=api_check_grammar,
        rewrite=api_rewrite,
        fix_sentence=api_fix_sentence,
        suggest_replies=api_suggest_replies,
        translate=api_translate,
        run_doctor=api_run_doctor,
    )

    # 5. Dashboard & Web Server
    dashboard_server = DashboardServer(api_dispatcher=dispatcher, port=settings_service.current.port)

    # 6. Desktop Window Launcher
    dashboard_service = DashboardService(
        window_launcher=show_window,
        default_url_provider=lambda: dashboard_server.url,
    )

    # 7. System-Wide OS Assistant
    clipboard_adapter = OsClipboardAdapter()
    os_bridge = NativeOsBridge(clipboard=clipboard_adapter)
    system_assist_service = SystemAssistService(
        clipboard=clipboard_adapter,
        active_app=os_bridge,
        injector=os_bridge,
        check_grammar_fn=api_check_grammar,
        rewrite_fn=api_rewrite,
        translate_fn=api_translate,
        on_assisted=lambda data: bus.publish("system.assisted", data),
    )

    # 8. Floating Correction Overlay (HUD across all workspaces & monitors)
    overlay_adapter = create_default_overlay_adapter()
    def overlay_fix():
        system_assist_service.assist_active_app(action="fix", in_place=True)

    def overlay_rewrite():
        system_assist_service.assist_active_app(action="rewrite", in_place=True)

    def overlay_open():
        dashboard_service.open()

    overlay_service = OverlayService(
        port=overlay_adapter,
        on_action={
            "fix": overlay_fix,
            "rewrite": overlay_rewrite,
            "open": overlay_open,
        },
    )

    def on_assisted_event(data):
        app = data.get("active_app", "Word")
        cnt = data.get("issue_count", 0)
        status = "fixed" if data.get("success") else "ready"
        overlay_service.update_status(active_app=app, status=status, issues_count=cnt)

    bus.subscribe("system.assisted", on_assisted_event)

    return Container(
        bus=bus,
        settings=settings_service,
        dictionary=dict_service,
        assistant=assistant_service,
        dispatcher=dispatcher,
        server=dashboard_server,
        dashboard=dashboard_service,
        system_assist=system_assist_service,
        overlay=overlay_service,
    )

