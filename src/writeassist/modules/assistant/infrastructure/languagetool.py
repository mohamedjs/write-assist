"""LanguageTool concrete adapter for grammar and spelling checks."""

import json
import logging
import urllib.parse
import urllib.request

from ..domain import CheckResult, GrammarCheckerPort, GrammarMatch

log = logging.getLogger(__name__)


class LanguageToolAdapter(GrammarCheckerPort):
    """Adapter invoking LanguageTool REST API."""

    DEFAULT_URL = "https://api.languagetool.org"

    def check(
        self,
        text: str,
        language: str = "auto",
        mother_tongue: str = "ar",
        server_url: str = "",
    ) -> CheckResult:
        base = (server_url.strip() or self.DEFAULT_URL).rstrip("/")
        endpoint = f"{base}/v2/check"

        params = {
            "text": text,
            "language": language or "auto",
        }
        if mother_tongue:
            params["motherTongue"] = mother_tongue

        data = urllib.parse.urlencode(params).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={"User-Agent": "WriteAssist/1.0", "Accept": "application/json"},
        )

        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                payload = json.loads(response.read().decode("utf-8"))

            detected_lang = payload.get("language", {}).get("detectedLanguage", {}).get("code", "en-US")
            matches: list[GrammarMatch] = []
            for item in payload.get("matches", []):
                rule = item.get("rule", {})
                category = rule.get("category", {}).get("id", "").lower()
                issue_type = "spelling" if "typo" in category or "misspelling" in category else "grammar"

                replacements = [r.get("value") for r in item.get("replacements", [])[:5] if r.get("value")]

                matches.append(
                    GrammarMatch(
                        message=item.get("message", ""),
                        short_message=item.get("shortMessage", "") or item.get("message", ""),
                        offset=item.get("offset", 0),
                        length=item.get("length", 0),
                        replacements=replacements,
                        rule_id=rule.get("id", ""),
                        issue_type=issue_type,
                    )
                )

            return CheckResult(text=text, matches=matches, language=detected_lang)
        except Exception as exc:
            log.warning("LanguageTool check failed: %s", exc)
            return CheckResult(text=text, matches=[], language="en-US")
