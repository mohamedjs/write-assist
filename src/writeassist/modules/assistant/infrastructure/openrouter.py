"""OpenRouter API concrete adapter for AI rewrite and generation."""

import json
import logging
import urllib.request

from ..domain import LLMPort

log = logging.getLogger(__name__)


class OpenRouterAdapter(LLMPort):
    """Adapter invoking OpenRouter REST API."""

    ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

    def _call_openrouter(self, messages: list[dict[str, str]], api_key: str, model: str = "openrouter/auto") -> str:
        payload = {
            "model": model or "openrouter/auto",
            "messages": messages,
            "temperature": 0.4,
        }
        req = urllib.request.Request(
            self.ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://github.com/mohamedjs/write-assist",
                "X-Title": "WriteAssist",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                data = json.loads(res.read().decode("utf-8"))
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "").strip()
            return ""
        except Exception as exc:
            log.warning("OpenRouter call failed: %s", exc)
            return f"Error contacting OpenRouter: {exc}"

    def rewrite(self, text: str, tone: str, api_key: str, model: str) -> str:
        messages = [
            {
                "role": "system",
                "content": f"You are WriteAssist. Rewrite the text to be {tone}. Output only revised text.",
            },
            {"role": "user", "content": text},
        ]
        return self._call_openrouter(messages, api_key, model)

    def fix_sentence(self, sentence: str, api_key: str, model: str) -> str:
        messages = [
            {"role": "system", "content": "Fix grammatical and spelling errors in the sentence. Return ONLY the fix."},
            {"role": "user", "content": sentence},
        ]
        return self._call_openrouter(messages, api_key, model)

    def suggest_replies(self, context: str, api_key: str, model: str) -> list[str]:
        messages = [
            {
                "role": "system",
                "content": "Generate 3 smart, concise replies to this message. Output as a JSON array of strings: [\"...\", \"...\", \"...\"]",
            },
            {"role": "user", "content": context},
        ]
        raw = self._call_openrouter(messages, api_key, model)
        try:
            start = raw.find("[")
            end = raw.rfind("]")
            if start != -1 and end != -1:
                parsed = json.loads(raw[start : end + 1])
                if isinstance(parsed, list):
                    return [str(s).strip() for s in parsed if s]
        except Exception:
            pass
        return [line.strip("-• 123. ") for line in raw.splitlines() if line.strip()][:3]
