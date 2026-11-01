"""API request dispatcher use-case handler."""

from typing import Any, Callable

from .domain import RouteHandler


class ApiDispatcher(RouteHandler):
    """Dispatches HTTP REST calls to application services."""

    def __init__(
        self,
        get_settings: Callable[[], dict[str, Any]],
        update_settings: Callable[[dict[str, Any]], dict[str, Any]],
        get_dictionary: Callable[[], list[str]],
        add_dictionary_word: Callable[[str], list[str]],
        remove_dictionary_word: Callable[[str], list[str]],
        check_grammar: Callable[..., dict[str, Any]],
        rewrite: Callable[..., dict[str, Any]],
        fix_sentence: Callable[..., str],
        suggest_replies: Callable[..., dict[str, Any]],
        translate: Callable[..., dict[str, Any]],
        run_doctor: Callable[[], dict[str, Any]],
        version: str = "1.0.0",
    ) -> None:
        self._get_settings = get_settings
        self._update_settings = update_settings
        self._get_dictionary = get_dictionary
        self._add_dict_word = add_dictionary_word
        self._rem_dict_word = remove_dictionary_word
        self._check_grammar = check_grammar
        self._rewrite = rewrite
        self._fix_sentence = fix_sentence
        self._suggest_replies = suggest_replies
        self._translate = translate
        self._run_doctor = run_doctor
        self._version = version

    def handle(self, method: str, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        clean_path = path.split("?")[0].rstrip("/")

        if method == "GET" and clean_path in ("", "/health"):
            return 200, {"status": "ok", "version": self._version, "service": "WriteAssist"}

        if method == "GET" and clean_path == "/api/settings":
            return 200, self._get_settings()

        if method == "POST" and clean_path == "/api/settings":
            return 200, self._update_settings(body)

        if method == "GET" and clean_path == "/api/dictionary":
            return 200, {"words": self._get_dictionary()}

        if method == "POST" and clean_path == "/api/dictionary/add":
            word = body.get("word", "")
            return 200, {"words": self._add_dict_word(word)}

        if method == "POST" and clean_path == "/api/dictionary/remove":
            word = body.get("word", "")
            return 200, {"words": self._rem_dict_word(word)}

        if method == "POST" and clean_path == "/api/check":
            text = body.get("text", "")
            lang = body.get("language", "auto")
            mt = body.get("mother_tongue", "ar")
            server = body.get("server_url", "")
            return 200, self._check_grammar(text, lang, mt, server)

        if method == "POST" and clean_path == "/api/rewrite":
            text = body.get("text", "")
            tone = body.get("tone", "clear")
            provider = body.get("provider", "auto")
            return 200, self._rewrite(text, tone, provider)

        if method == "POST" and clean_path == "/api/fix_sentence":
            sentence = body.get("sentence", "")
            provider = body.get("provider", "auto")
            fixed = self._fix_sentence(sentence, provider)
            return 200, {"sentence": fixed}

        if method == "POST" and clean_path == "/api/reply":
            context = body.get("context", "")
            provider = body.get("provider", "auto")
            return 200, self._suggest_replies(context, provider)

        if method == "POST" and clean_path == "/api/translate":
            text = body.get("text", "")
            source = body.get("source", "auto")
            target = body.get("target", "en")
            return 200, self._translate(text, source, target)

        if method == "GET" and clean_path == "/api/doctor":
            return 200, self._run_doctor()

        return 404, {"error": "Endpoint not found", "path": path}
