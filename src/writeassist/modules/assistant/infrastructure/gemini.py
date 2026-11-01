"""Google Gemini API concrete adapter for writing rewriting and generation."""

import json
import logging
import urllib.parse
import urllib.request

from ..domain import LLMPort

log = logging.getLogger(__name__)


class GeminiAdapter(LLMPort):
    """Adapter invoking Google Gemini REST API."""

    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

    def _call_gemini(self, prompt: str, system_instruction: str, api_key: str, model: str = "gemini-2.5-flash") -> str:
        model_name = model or "gemini-2.5-flash"
        if not model_name.startswith("gemini-"):
            model_name = "gemini-2.5-flash"

        url = f"{self.BASE_URL}/{model_name}:generateContent?key={urllib.parse.quote(api_key)}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048},
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                data = json.loads(res.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
            return ""
        except Exception as exc:
            log.warning("Gemini call failed: %s", exc)
            return f"Error contacting Gemini: {exc}"

    def rewrite(self, text: str, tone: str, api_key: str, model: str) -> str:
        system = (
            f"You are WriteAssist, a world-class professional writing editor. "
            f"Rewrite the input text to be {tone}. Maintain the core meaning and facts. "
            f"Output ONLY the revised text with no explanations, greetings, or commentary."
        )
        return self._call_gemini(prompt=text, system_instruction=system, api_key=api_key, model=model)

    def fix_sentence(self, sentence: str, api_key: str, model: str) -> str:
        system = (
            "You are a grammar and style editor. Fix any grammatical, spelling, or punctuation errors "
            "in the given sentence. Keep changes minimal and natural. Return ONLY the corrected sentence."
        )
        return self._call_gemini(prompt=sentence, system_instruction=system, api_key=api_key, model=model)

    def suggest_replies(self, context: str, api_key: str, model: str) -> list[str]:
        system = (
            "You are a communication assistant. Based on the incoming message, generate exactly 3 distinct, "
            "concise reply options: 1) Positive/Accepting, 2) Neutral/Clarifying, 3) Polite decline or alternate. "
            "Output the replies as a JSON list of 3 strings: [\"reply 1\", \"reply 2\", \"reply 3\"]."
        )
        raw = self._call_gemini(prompt=context, system_instruction=system, api_key=api_key, model=model)
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
