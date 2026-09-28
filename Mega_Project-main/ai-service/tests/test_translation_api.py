from fastapi.testclient import TestClient

from app.main import app
from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError

client = TestClient(app)


def _patch_translate(monkeypatch, result=None, error=None):
    async def fake_translate(text, source_lang):
        if error is not None:
            raise error
        return result

    monkeypatch.setattr("app.api.translation.translate_text_to_all_languages", fake_translate)


def test_translate_success(monkeypatch):
    _patch_translate(
        monkeypatch,
        result={"en": "Experienced plumber", "mr": "अनुभवी प्लंबर", "hi": "अनुभवी प्लंबर"},
    )

    response = client.post("/translation/translate", json={"text": "Experienced plumber", "source_lang": "en"})

    assert response.status_code == 200
    assert response.json() == {"en": "Experienced plumber", "mr": "अनुभवी प्लंबर", "hi": "अनुभवी प्लंबर"}


def test_translate_defaults_source_lang_to_en(monkeypatch):
    captured = {}

    async def fake_translate(text, source_lang):
        captured["source_lang"] = source_lang
        return {"en": text, "mr": "x", "hi": "y"}

    monkeypatch.setattr("app.api.translation.translate_text_to_all_languages", fake_translate)

    response = client.post("/translation/translate", json={"text": "hello"})

    assert response.status_code == 200
    assert captured["source_lang"] == "en"


def test_translate_missing_text_returns_422():
    response = client.post("/translation/translate", json={"source_lang": "en"})

    assert response.status_code == 422


def test_translate_empty_text_returns_422():
    response = client.post("/translation/translate", json={"text": "", "source_lang": "en"})

    assert response.status_code == 422


def test_translate_invalid_source_lang_returns_422():
    response = client.post("/translation/translate", json={"text": "hello", "source_lang": "fr"})

    assert response.status_code == 422


def test_translate_service_unavailable_returns_503(monkeypatch):
    _patch_translate(monkeypatch, error=AiServiceUnavailableError("no key"))

    response = client.post("/translation/translate", json={"text": "hello", "source_lang": "en"})

    assert response.status_code == 503


def test_translate_provider_error_4xx_passed_through(monkeypatch):
    _patch_translate(monkeypatch, error=SarvamProviderError("bad request", status_code=400))

    response = client.post("/translation/translate", json={"text": "hello", "source_lang": "en"})

    assert response.status_code == 400


def test_translate_provider_error_5xx_maps_to_502(monkeypatch):
    _patch_translate(monkeypatch, error=SarvamProviderError("upstream down", status_code=503))

    response = client.post("/translation/translate", json={"text": "hello", "source_lang": "en"})

    assert response.status_code == 502


def test_translate_requires_api_key_when_configured(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")
    _patch_translate(monkeypatch, result={"en": "hello", "mr": "x", "hi": "y"})

    response = client.post("/translation/translate", json={"text": "hello", "source_lang": "en"})

    assert response.status_code == 401


def test_translate_with_valid_api_key_succeeds(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")
    _patch_translate(monkeypatch, result={"en": "hello", "mr": "x", "hi": "y"})

    response = client.post(
        "/translation/translate",
        json={"text": "hello", "source_lang": "en"},
        headers={"X-AI-Service-Key": "secret123"},
    )

    assert response.status_code == 200
