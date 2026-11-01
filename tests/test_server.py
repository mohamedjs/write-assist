"""Unit tests for API dispatcher endpoints."""

from writeassist.bootstrap import build


def test_api_dispatcher():
    c = build()
    dispatcher = c.dispatcher

    # 1. Health check
    code, resp = dispatcher.handle("GET", "/health", {})
    assert code == 200
    assert resp["status"] == "ok"
    assert resp["service"] == "WriteAssist"

    # 2. Settings endpoint
    code, resp = dispatcher.handle("GET", "/api/settings", {})
    assert code == 200
    assert "port" in resp

    # 3. Dictionary endpoints
    code, resp = dispatcher.handle("POST", "/api/dictionary/add", {"word": "SuperWord"})
    assert code == 200
    assert "superword" in resp["words"]

    code, resp = dispatcher.handle("GET", "/api/dictionary", {})
    assert code == 200
    assert "superword" in resp["words"]

    code, resp = dispatcher.handle("POST", "/api/dictionary/remove", {"word": "SuperWord"})
    assert code == 200
    assert "superword" not in resp["words"]


if __name__ == "__main__":
    test_api_dispatcher()
    print("test_server PASSED")
