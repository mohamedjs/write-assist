"""Google Translate concrete adapter."""

import json
import logging
import urllib.parse
import urllib.request

from ..domain import TranslationResult, TranslatorPort

log = logging.getLogger(__name__)


class GoogleTranslateAdapter(TranslatorPort):
    """Adapter invoking free Google Translate endpoint."""

    ENDPOINT = "https://translate.googleapis.com/translate_a/single"

    def translate(self, text: str, source: str = "auto", target: str = "en") -> TranslationResult:
        params = {
            "client": "gtx",
            "sl": source or "auto",
            "tl": target or "en",
            "dt": "t",
            "q": text,
        }
        url = f"{self.ENDPOINT}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                raw = json.loads(res.read().decode("utf-8"))

            translated_chunks = []
            if raw and isinstance(raw[0], list):
                for chunk in raw[0]:
                    if chunk and chunk[0]:
                        translated_chunks.append(chunk[0])

            detected = raw[2] if len(raw) > 2 and isinstance(raw[2], str) else source
            return TranslationResult(
                original_text=text,
                translated_text="".join(translated_chunks),
                source_lang=detected,
                target_lang=target,
            )
        except Exception as exc:
            log.warning("Translation failed: %s", exc)
            return TranslationResult(
                original_text=text,
                translated_text=f"Translation error: {exc}",
                source_lang=source,
                target_lang=target,
            )
