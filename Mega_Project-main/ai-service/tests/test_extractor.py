import asyncio
import json
from types import SimpleNamespace

import pytest

from app.extraction.extractor import extract_profile_from_transcript, get_extraction_provider
from app.extraction.local_llm_extractor import LocalLLMExtractor
from app.extraction.models import ExtractedProfile
from app.extraction.sarvam_extractor import SarvamExtractor
from app.sarvam.errors import AiServiceUnavailableError

# --- get_extraction_provider() - provider selection -------------------------


def test_defaults_to_local_llm_when_unset(monkeypatch):
    monkeypatch.delenv("EXTRACTION_PROVIDER", raising=False)
    assert isinstance(get_extraction_provider(), LocalLLMExtractor)


def test_selects_local_llm_explicitly(monkeypatch):
    monkeypatch.setenv("EXTRACTION_PROVIDER", "local_llm")
    assert isinstance(get_extraction_provider(), LocalLLMExtractor)


def test_selects_sarvam_explicitly(monkeypatch):
    monkeypatch.setenv("EXTRACTION_PROVIDER", "sarvam")
    assert isinstance(get_extraction_provider(), SarvamExtractor)


def test_provider_selection_is_case_insensitive(monkeypatch):
    monkeypatch.setenv("EXTRACTION_PROVIDER", "SARVAM")
    assert isinstance(get_extraction_provider(), SarvamExtractor)

    monkeypatch.setenv("EXTRACTION_PROVIDER", "Local_LLM")
    assert isinstance(get_extraction_provider(), LocalLLMExtractor)


def test_unknown_provider_raises_ai_service_unavailable(monkeypatch):
    monkeypatch.setenv("EXTRACTION_PROVIDER", "some-provider-that-does-not-exist")

    with pytest.raises(AiServiceUnavailableError):
        get_extraction_provider()


# --- extract_profile_from_transcript() - dispatch behavior -------------------


def test_extract_profile_delegates_to_the_selected_provider(monkeypatch):
    monkeypatch.setenv("EXTRACTION_PROVIDER", "local_llm")
    captured = {}

    async def fake_extract(self, transcript):
        captured["transcript"] = transcript
        return ExtractedProfile(fullName="Delegated Name")

    monkeypatch.setattr(LocalLLMExtractor, "extract", fake_extract)

    profile = asyncio.run(extract_profile_from_transcript("some transcript"))

    assert profile.full_name == "Delegated Name"
    assert captured["transcript"] == "some transcript"


def test_extract_profile_with_sarvam_provider_still_works_through_the_abstraction(monkeypatch):
    """
    Confirms SarvamExtractor remains fully reachable and functional through
    the provider-agnostic extract_profile_from_transcript() dispatcher -
    Sarvam is being kept available, not silently broken by this migration.
    """

    monkeypatch.setenv("EXTRACTION_PROVIDER", "sarvam")

    payload = {
        "fullName": "Sarvam Path",
        "experienceYears": None,
        "expectedPay": None,
        "skills": None,
        "city": None,
        "bio": None,
        "availability": None,
        "languages": None,
        "preferredJobCategories": None,
    }
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
    )

    class _FakeSpeechChat:
        async def completions(self, **kwargs):
            return response

    class _FakeClient:
        chat = _FakeSpeechChat()

    monkeypatch.setattr("app.extraction.sarvam_extractor.get_sarvam_client", lambda: _FakeClient())

    profile = asyncio.run(extract_profile_from_transcript("transcript"))

    assert profile.full_name == "Sarvam Path"


def test_extract_profile_propagates_provider_exceptions_unchanged(monkeypatch):
    monkeypatch.setenv("EXTRACTION_PROVIDER", "local_llm")

    async def fake_extract(self, transcript):
        raise ValueError("bad output")

    monkeypatch.setattr(LocalLLMExtractor, "extract", fake_extract)

    with pytest.raises(ValueError):
        asyncio.run(extract_profile_from_transcript("transcript"))
