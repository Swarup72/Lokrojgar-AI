import asyncio
from types import SimpleNamespace

import pytest
from sarvamai.core.api_error import ApiError

from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError
from app.translation.translator import translate_text_to_all_languages


class _FakeText:
    def __init__(self, translations=None, error=None):
        self._translations = translations or {}
        self._error = error
        self.calls = []

    async def translate(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        target = kwargs["target_language_code"]
        return SimpleNamespace(translated_text=self._translations[target])


class _FakeClient:
    def __init__(self, text):
        self.text = text


def _patch_client(monkeypatch, client):
    monkeypatch.setattr("app.translation.translator.get_sarvam_client", lambda: client)


def test_translate_from_english_translates_to_mr_and_hi(monkeypatch):
    text_client = _FakeText(translations={"mr-IN": "अनुभवी प्लंबर", "hi-IN": "अनुभवी प्लंबर"})
    _patch_client(monkeypatch, _FakeClient(text_client))

    result = asyncio.run(translate_text_to_all_languages("Experienced plumber", "en"))

    assert result == {"en": "Experienced plumber", "mr": "अनुभवी प्लंबर", "hi": "अनुभवी प्लंबर"}
    assert len(text_client.calls) == 2


def test_translate_from_marathi_translates_to_hi_and_en(monkeypatch):
    text_client = _FakeText(translations={"hi-IN": "अनुभवी प्लंबर", "en-IN": "Experienced plumber"})
    _patch_client(monkeypatch, _FakeClient(text_client))

    result = asyncio.run(translate_text_to_all_languages("अनुभवी प्लंबर", "mr"))

    assert result["mr"] == "अनुभवी प्लंबर"
    assert result["hi"] == "अनुभवी प्लंबर"
    assert result["en"] == "Experienced plumber"


def test_translate_raises_when_no_client(monkeypatch):
    _patch_client(monkeypatch, None)

    with pytest.raises(AiServiceUnavailableError):
        asyncio.run(translate_text_to_all_languages("text", "en"))


def test_translate_wraps_api_error_as_provider_error(monkeypatch):
    error = ApiError(status_code=500, body="upstream failure")
    _patch_client(monkeypatch, _FakeClient(_FakeText(error=error)))

    with pytest.raises(SarvamProviderError) as exc_info:
        asyncio.run(translate_text_to_all_languages("text", "en"))

    assert exc_info.value.status_code == 500


def test_translate_uses_correct_language_codes(monkeypatch):
    text_client = _FakeText(translations={"mr-IN": "x", "hi-IN": "y"})
    _patch_client(monkeypatch, _FakeClient(text_client))

    asyncio.run(translate_text_to_all_languages("text", "en"))

    source_codes = {call["source_language_code"] for call in text_client.calls}
    target_codes = {call["target_language_code"] for call in text_client.calls}
    assert source_codes == {"en-IN"}
    assert target_codes == {"mr-IN", "hi-IN"}
