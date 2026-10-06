import asyncio
import json
import sys

import mlx_lm
import pytest

from app.extraction.local_llm_extractor import LocalLLMExtractor
from app.extraction.local_llm_runtime import DEFAULT_LOCAL_LLM_MODEL, LocalLLMRuntime
from app.sarvam.errors import AiServiceUnavailableError


@pytest.fixture(autouse=True)
def _reset_model_cache():
    LocalLLMRuntime._cached_model = None
    LocalLLMRuntime._cached_tokenizer = None
    LocalLLMRuntime._cached_model_name = None
    yield
    LocalLLMRuntime._cached_model = None
    LocalLLMRuntime._cached_tokenizer = None
    LocalLLMRuntime._cached_model_name = None


class _FakeTokenizer:
    def __init__(self):
        self.chat_template_calls = []

    def apply_chat_template(self, messages, **kwargs):
        self.chat_template_calls.append({"messages": messages, **kwargs})
        return "FAKE_PROMPT"


class _FakeGenerateCall:
    def __init__(self, generate_fn):
        self._generate_fn = generate_fn
        self.calls = []

    def __call__(self, model, tokenizer, prompt, **kwargs):
        self.calls.append({"model": model, "tokenizer": tokenizer, "prompt": prompt, **kwargs})
        return self._generate_fn(prompt, **kwargs)


def _patch_llm(monkeypatch, output_text, load_fn=None):
    tokenizer = _FakeTokenizer()
    monkeypatch.setattr(mlx_lm, "load", load_fn or (lambda name: ("FAKE_MODEL", tokenizer)))
    fake_generate = _FakeGenerateCall(lambda prompt, **kw: output_text)
    monkeypatch.setattr(mlx_lm, "generate", fake_generate)
    return tokenizer, fake_generate


_FULL_PAYLOAD = {
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


def _payload(**overrides):
    payload = dict(_FULL_PAYLOAD)
    payload.update(overrides)
    return payload


# --- laziness / caching / mechanics ------------------------------------------


def test_provider_initializes_without_touching_mlx_lm(monkeypatch):
    load_calls = []
    monkeypatch.setattr(mlx_lm, "load", lambda name: load_calls.append(name))

    LocalLLMExtractor()

    assert load_calls == []


def test_model_loading_happens_only_when_extract_is_called(monkeypatch):
    load_calls = []

    def _load(name):
        load_calls.append(name)
        return "FAKE_MODEL", _FakeTokenizer()

    _patch_llm(monkeypatch, json.dumps(_payload()), load_fn=_load)

    provider = LocalLLMExtractor()
    assert load_calls == []

    asyncio.run(provider.extract("transcript"))

    assert len(load_calls) == 1


def test_model_is_cached_across_calls(monkeypatch):
    load_calls = []

    def _load(name):
        load_calls.append(name)
        return "FAKE_MODEL", _FakeTokenizer()

    _patch_llm(monkeypatch, json.dumps(_payload()), load_fn=_load)

    provider = LocalLLMExtractor()
    asyncio.run(provider.extract("transcript one"))
    asyncio.run(provider.extract("transcript two"))

    assert len(load_calls) == 1


def test_model_repo_configurable_via_env(monkeypatch):
    monkeypatch.setenv("LOCAL_LLM_MODEL", "mlx-community/some-other-model-4bit")
    load_calls = []

    def _load(name):
        load_calls.append(name)
        return "FAKE_MODEL", _FakeTokenizer()

    _patch_llm(monkeypatch, json.dumps(_payload()), load_fn=_load)

    asyncio.run(LocalLLMExtractor().extract("transcript"))

    assert load_calls == ["mlx-community/some-other-model-4bit"]


def test_default_model_is_used_when_env_unset(monkeypatch):
    monkeypatch.delenv("LOCAL_LLM_MODEL", raising=False)
    load_calls = []

    def _load(name):
        load_calls.append(name)
        return "FAKE_MODEL", _FakeTokenizer()

    _patch_llm(monkeypatch, json.dumps(_payload()), load_fn=_load)

    asyncio.run(LocalLLMExtractor().extract("transcript"))

    assert load_calls == [DEFAULT_LOCAL_LLM_MODEL]


def test_thinking_mode_is_disabled_in_chat_template(monkeypatch):
    tokenizer, _ = _patch_llm(monkeypatch, json.dumps(_payload()))

    asyncio.run(LocalLLMExtractor().extract("transcript"))

    assert tokenizer.chat_template_calls[0]["enable_thinking"] is False


def test_extract_raises_ai_service_unavailable_when_mlx_lm_not_importable(monkeypatch):
    monkeypatch.setitem(sys.modules, "mlx_lm", None)

    with pytest.raises(AiServiceUnavailableError):
        asyncio.run(LocalLLMExtractor().extract("transcript"))


def test_extract_empty_transcript_raises_without_calling_model(monkeypatch):
    load_calls = []
    monkeypatch.setattr(mlx_lm, "load", lambda name: load_calls.append(name))

    with pytest.raises(ValueError):
        asyncio.run(LocalLLMExtractor().extract("   "))

    assert load_calls == []


# --- 1. complete Hindi-English profile ---------------------------------------


def test_complete_hindi_english_profile(monkeypatch):
    payload = _payload(
        fullName="Rahul Sharma",
        experienceYears=5,
        expectedPay=15000,
        skills=["plumber"],
        city="Mumbai",
        bio="Plumber with 5 years of experience in Mumbai.",
        availability="available",
        languages=["hi", "en"],
    )
    _patch_llm(monkeypatch, json.dumps(payload))

    profile = asyncio.run(
        LocalLLMExtractor().extract(
            "मेरा नाम राहुल शर्मा है। मुझे 5 years experience है plumber के तौर पर। "
            "मैं मुंबई में रहता हूँ और मुझे 15,000 rupees salary चाहिए।"
        )
    )

    assert profile.full_name == "Rahul Sharma"
    assert profile.experience_years == 5
    assert profile.expected_pay == 15000
    assert profile.skills == ["plumber"]
    assert profile.city == "Mumbai"
    assert profile.availability == "available"
    assert profile.languages == ["hi", "en"]


# --- 2. complete Marathi-English profile -------------------------------------


def test_complete_marathi_english_profile(monkeypatch):
    payload = _payload(
        fullName="Sunita Jadhav",
        experienceYears=5,
        expectedPay=10000,
        skills=["electrician"],
        city="Pune",
        bio="Electrician with 5 years of experience in Pune.",
        availability="available",
        languages=["mr", "en"],
    )
    _patch_llm(monkeypatch, json.dumps(payload))

    profile = asyncio.run(
        LocalLLMExtractor().extract(
            "माझं नाव सुनीता जाधव आहे. मला 5 years experience आहे electrician म्हणून. "
            "मी सध्या Pune मध्ये राहते आणि मला 10,000 salary पाहिजे."
        )
    )

    assert profile.full_name == "Sunita Jadhav"
    assert profile.skills == ["electrician"]
    assert profile.city == "Pune"
    assert profile.expected_pay == 10000


# --- 3. missing salary --------------------------------------------------------


def test_missing_salary_is_null_not_guessed(monkeypatch):
    payload = _payload(fullName="Rahul Sharma", experienceYears=5, skills=["plumber"], city="Mumbai")
    _patch_llm(monkeypatch, json.dumps(payload))

    profile = asyncio.run(LocalLLMExtractor().extract("मेरा नाम राहुल शर्मा है, मुझे plumber का 5 साल अनुभव है"))

    assert profile.expected_pay is None
    assert profile.full_name == "Rahul Sharma"


# --- 4. missing experience ----------------------------------------------------


def test_missing_experience_is_null_not_guessed(monkeypatch):
    payload = _payload(fullName="Rahul Sharma", skills=["plumber"], city="Mumbai")
    _patch_llm(monkeypatch, json.dumps(payload))

    profile = asyncio.run(LocalLLMExtractor().extract("मेरा नाम राहुल शर्मा है, मैं plumber हूं"))

    assert profile.experience_years is None
    assert profile.full_name == "Rahul Sharma"


# --- 5. missing location -------------------------------------------------------


def test_missing_location_is_null_not_guessed(monkeypatch):
    payload = _payload(fullName="Rahul Sharma", experienceYears=5, skills=["plumber"])
    _patch_llm(monkeypatch, json.dumps(payload))

    profile = asyncio.run(LocalLLMExtractor().extract("मेरा नाम राहुल शर्मा है, plumber का 5 साल अनुभव"))

    assert profile.city is None


# --- 6. multiple skills --------------------------------------------------------


def test_multiple_skills_all_preserved(monkeypatch):
    payload = _payload(fullName="Rahul Sharma", skills=["plumber", "electrician", "welder"])
    _patch_llm(monkeypatch, json.dumps(payload))

    profile = asyncio.run(LocalLLMExtractor().extract("मैं plumber, electrician और welder हूं"))

    assert profile.skills == ["plumber", "electrician", "welder"]


# --- 7. malformed LLM JSON -----------------------------------------------------


def test_malformed_json_raises_value_error_without_fabricating(monkeypatch):
    _patch_llm(monkeypatch, "Sure, here is some information about the speaker but no JSON at all.")

    with pytest.raises(ValueError):
        asyncio.run(LocalLLMExtractor().extract("transcript"))


def test_json_wrapped_in_markdown_fence_is_still_parsed(monkeypatch):
    payload = _payload(fullName="Rahul Sharma")
    fenced = f"```json\n{json.dumps(payload)}\n```"
    _patch_llm(monkeypatch, fenced)

    profile = asyncio.run(LocalLLMExtractor().extract("transcript"))

    assert profile.full_name == "Rahul Sharma"


# --- 8. invalid schema output ---------------------------------------------------


def test_invalid_schema_output_raises_value_error(monkeypatch):
    # experienceYears must be >= 0 per ExtractedProfile's Field(ge=0).
    payload = _payload(fullName="Rahul Sharma", experienceYears=-3)
    _patch_llm(monkeypatch, json.dumps(payload))

    with pytest.raises(ValueError):
        asyncio.run(LocalLLMExtractor().extract("transcript"))


def test_invalid_availability_enum_value_raises_value_error(monkeypatch):
    payload = _payload(fullName="Rahul Sharma", availability="somewhat_available")
    _patch_llm(monkeypatch, json.dumps(payload))

    with pytest.raises(ValueError):
        asyncio.run(LocalLLMExtractor().extract("transcript"))


# --- 9. unknown fields -----------------------------------------------------------


def test_unknown_extra_field_is_rejected_not_silently_dropped(monkeypatch):
    payload = _payload(fullName="Rahul Sharma")
    payload["age"] = 30  # not part of ExtractedProfile's schema at all
    _patch_llm(monkeypatch, json.dumps(payload))

    with pytest.raises(ValueError):
        asyncio.run(LocalLLMExtractor().extract("transcript"))


# --- 10. no hallucinated values --------------------------------------------------


def test_all_null_fields_are_preserved_as_null_not_filled_in(monkeypatch):
    _patch_llm(monkeypatch, json.dumps(_payload()))

    profile = asyncio.run(LocalLLMExtractor().extract("random unrelated chatter with no profile information"))

    assert profile.full_name is None
    assert profile.experience_years is None
    assert profile.expected_pay is None
    assert profile.skills is None
    assert profile.city is None
    assert profile.availability is None
    assert profile.languages is None
