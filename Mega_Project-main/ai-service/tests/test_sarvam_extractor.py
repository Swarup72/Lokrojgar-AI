import asyncio
import json
from types import SimpleNamespace

import pytest
from sarvamai.core.api_error import ApiError

from app.extraction.sarvam_extractor import SarvamExtractor
from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError


def _chat_response(content: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


class _FakeChat:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.calls = []

    async def completions(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class _FakeClient:
    def __init__(self, chat):
        self.chat = chat


def _patch_client(monkeypatch, client):
    monkeypatch.setattr("app.extraction.sarvam_extractor.get_sarvam_client", lambda: client)


def test_extract_profile_success(monkeypatch):
    payload = {
        "fullName": "Ramesh Patil",
        "experienceYears": 5,
        "expectedPay": 800,
        "skills": ["plumbing"],
        "city": "Pune",
        "bio": "Experienced plumber",
        "availability": "available",
        "languages": ["mr", "hi"],
        "preferredJobCategories": None,
    }
    chat = _FakeChat(response=_chat_response(json.dumps(payload)))
    _patch_client(monkeypatch, _FakeClient(chat))

    profile = asyncio.run(SarvamExtractor().extract("मी प्लंबर आहे, ५ वर्ष अनुभव"))

    assert profile.full_name == "Ramesh Patil"
    assert profile.experience_years == 5
    assert profile.skills == ["plumbing"]
    assert profile.availability == "available"
    assert chat.calls[0]["response_format"]["json_schema"]["strict"] is True


def test_extract_profile_all_null_fields_valid(monkeypatch):
    payload = {
        "fullName": None,
        "experienceYears": None,
        "expectedPay": None,
        "skills": None,
        "city": None,
        "bio": None,
        "availability": None,
        "languages": None,
        "preferredJobCategories": None,
    }
    _patch_client(monkeypatch, _FakeClient(_FakeChat(response=_chat_response(json.dumps(payload)))))

    profile = asyncio.run(SarvamExtractor().extract("..."))

    assert profile.full_name is None
    assert profile.skills is None


def test_extract_profile_raises_when_no_client(monkeypatch):
    _patch_client(monkeypatch, None)

    with pytest.raises(AiServiceUnavailableError):
        asyncio.run(SarvamExtractor().extract("transcript"))


def test_extract_profile_raises_on_empty_content(monkeypatch):
    _patch_client(monkeypatch, _FakeClient(_FakeChat(response=_chat_response(""))))

    with pytest.raises(ValueError):
        asyncio.run(SarvamExtractor().extract("transcript"))


def test_extract_profile_raises_on_malformed_json(monkeypatch):
    _patch_client(monkeypatch, _FakeClient(_FakeChat(response=_chat_response("not json"))))

    with pytest.raises(ValueError):
        asyncio.run(SarvamExtractor().extract("transcript"))


def test_extract_profile_raises_on_schema_validation_failure(monkeypatch):
    # experienceYears must be >= 0 - a negative value must fail Pydantic
    # validation even though it round-tripped as valid JSON.
    payload = {
        "fullName": "X",
        "experienceYears": -5,
        "expectedPay": None,
        "skills": None,
        "city": None,
        "bio": None,
        "availability": None,
        "languages": None,
        "preferredJobCategories": None,
    }
    _patch_client(monkeypatch, _FakeClient(_FakeChat(response=_chat_response(json.dumps(payload)))))

    with pytest.raises(ValueError):
        asyncio.run(SarvamExtractor().extract("transcript"))


def test_extract_profile_wraps_api_error_as_provider_error(monkeypatch):
    error = ApiError(status_code=401, body="invalid key")
    _patch_client(monkeypatch, _FakeClient(_FakeChat(error=error)))

    with pytest.raises(SarvamProviderError) as exc_info:
        asyncio.run(SarvamExtractor().extract("transcript"))

    assert exc_info.value.status_code == 401
