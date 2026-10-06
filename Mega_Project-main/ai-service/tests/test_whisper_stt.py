import asyncio
import os

import pytest
import whisper

from app.sarvam.errors import AiServiceUnavailableError
from app.voice.whisper_stt import WhisperSTT, _resolve_device, _resolve_whisper_language


@pytest.fixture(autouse=True)
def _reset_model_cache():
    """WhisperSTT caches the loaded model at class level - reset between
    tests so one test's mock/config never leaks into another."""
    WhisperSTT._cached_model = None
    WhisperSTT._cached_model_key = None
    yield
    WhisperSTT._cached_model = None
    WhisperSTT._cached_model_key = None


class _FakeModel:
    def __init__(self, transcribe_fn):
        self._transcribe_fn = transcribe_fn
        self.calls = []

    def transcribe(self, audio_path, **kwargs):
        self.calls.append({"audio_path": audio_path, **kwargs})
        return self._transcribe_fn(audio_path, **kwargs)


# --- _resolve_whisper_language() --------------------------------------------


def test_resolve_whisper_language_passes_through_known_codes():
    assert _resolve_whisper_language("mr") == "mr"
    assert _resolve_whisper_language("hi") == "hi"
    assert _resolve_whisper_language("en") == "en"


def test_resolve_whisper_language_auto_detects_for_auto_or_empty():
    assert _resolve_whisper_language("auto") is None
    assert _resolve_whisper_language("") is None


def test_resolve_whisper_language_auto_detects_for_unrecognized_code():
    assert _resolve_whisper_language("fr") is None


# --- _resolve_device() ------------------------------------------------------


def test_resolve_device_forces_cpu_when_explicitly_requested(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    assert _resolve_device() == "cpu"


def test_resolve_device_auto_uses_mps_when_available(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "auto")
    monkeypatch.setattr("app.voice.whisper_stt._mps_available", lambda: True)
    assert _resolve_device() == "mps"


def test_resolve_device_auto_falls_back_to_cpu_when_mps_unavailable(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "auto")
    monkeypatch.setattr("app.voice.whisper_stt._mps_available", lambda: False)
    assert _resolve_device() == "cpu"


def test_resolve_device_never_fails_when_mps_explicitly_requested_but_unavailable(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "mps")
    monkeypatch.setattr("app.voice.whisper_stt._mps_available", lambda: False)
    assert _resolve_device() == "cpu"


# --- WhisperSTT.transcribe() -------------------------------------------------


def test_transcribe_success(monkeypatch, tmp_path):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    fake_model = _FakeModel(lambda path, **kw: {"text": "My name is Rahul", "language": "en"})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    transcript, confidence = asyncio.run(
        WhisperSTT().transcribe(audio_bytes=b"fake-audio-bytes", filename="a.wav", content_type="audio/wav", language="en")
    )

    assert transcript == "My name is Rahul"
    # Whisper has no comparable confidence signal - must be honestly None,
    # never a fabricated number.
    assert confidence is None


def test_transcribe_uses_transcribe_task_never_translate(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    fake_model = _FakeModel(lambda path, **kw: {"text": "text", "language": "mr"})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="mr"))

    assert fake_model.calls[0]["task"] == "transcribe"


def test_transcribe_passes_language_hint_through_to_model(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    fake_model = _FakeModel(lambda path, **kw: {"text": "text", "language": kw.get("language")})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="hi"))

    assert fake_model.calls[0]["language"] == "hi"


def test_transcribe_defaults_condition_on_previous_text_to_true(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    monkeypatch.delenv("WHISPER_CONDITION_ON_PREVIOUS_TEXT", raising=False)
    fake_model = _FakeModel(lambda path, **kw: {"text": "text"})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))

    assert fake_model.calls[0]["condition_on_previous_text"] is True


def test_transcribe_condition_on_previous_text_can_be_disabled_via_env(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    monkeypatch.setenv("WHISPER_CONDITION_ON_PREVIOUS_TEXT", "false")
    fake_model = _FakeModel(lambda path, **kw: {"text": "text"})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))

    assert fake_model.calls[0]["condition_on_previous_text"] is False


def test_transcribe_defaults_beam_size_unset(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    monkeypatch.delenv("WHISPER_BEAM_SIZE", raising=False)
    fake_model = _FakeModel(lambda path, **kw: {"text": "text"})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))

    assert "beam_size" not in fake_model.calls[0]
    assert "temperature" not in fake_model.calls[0]


def test_transcribe_beam_size_can_be_set_via_env_and_pins_temperature_to_zero(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    monkeypatch.setenv("WHISPER_BEAM_SIZE", "5")
    fake_model = _FakeModel(lambda path, **kw: {"text": "text"})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))

    assert fake_model.calls[0]["beam_size"] == 5
    assert fake_model.calls[0]["temperature"] == 0


def test_transcribe_auto_language_passes_none_for_auto_detection(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    fake_model = _FakeModel(lambda path, **kw: {"text": "text"})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="auto"))

    assert fake_model.calls[0]["language"] is None


def test_transcribe_empty_audio_bytes_raises_without_loading_model(monkeypatch):
    load_calls = []
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: load_calls.append(1))

    with pytest.raises(ValueError):
        asyncio.run(WhisperSTT().transcribe(audio_bytes=b"", filename="a.wav", content_type="audio/wav", language="en"))

    assert load_calls == []


def test_transcribe_empty_transcript_raises_valueerror(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    fake_model = _FakeModel(lambda path, **kw: {"text": "   "})
    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: fake_model)

    with pytest.raises(ValueError):
        asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))


def test_model_load_failure_raises_ai_service_unavailable(monkeypatch):
    def _raise(name, device=None):
        raise RuntimeError("model download failed")

    monkeypatch.setattr(whisper, "load_model", _raise)

    with pytest.raises(AiServiceUnavailableError):
        asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))


def test_model_is_cached_across_calls_with_same_config(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    load_calls = []

    def _load(name, device=None):
        load_calls.append((name, device))
        return _FakeModel(lambda path, **kw: {"text": "hello"})

    monkeypatch.setattr(whisper, "load_model", _load)

    provider = WhisperSTT()
    asyncio.run(provider.transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))
    asyncio.run(provider.transcribe(audio_bytes=b"y", filename="b.wav", content_type="audio/wav", language="en"))

    assert len(load_calls) == 1


def test_mps_runtime_error_falls_back_to_cpu_and_succeeds(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "mps")
    monkeypatch.setattr("app.voice.whisper_stt._mps_available", lambda: True)

    def _mps_transcribe(path, **kw):
        raise RuntimeError("MPS op not implemented")

    cpu_model = _FakeModel(lambda path, **kw: {"text": "fallback worked"})
    mps_model = _FakeModel(_mps_transcribe)

    def _load(name, device=None):
        return mps_model if device == "mps" else cpu_model

    monkeypatch.setattr(whisper, "load_model", _load)

    transcript, _ = asyncio.run(
        WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en")
    )

    assert transcript == "fallback worked"


def test_cpu_runtime_error_raises_valueerror_without_retry(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")

    def _raise(path, **kw):
        raise RuntimeError("genuinely bad audio")

    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: _FakeModel(_raise))

    with pytest.raises(ValueError):
        asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))


def test_temp_file_is_cleaned_up_after_transcription(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    captured_path = {}

    def _transcribe(path, **kw):
        captured_path["path"] = path
        assert os.path.exists(path), "temp file must exist while whisper is using it"
        return {"text": "hello"}

    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: _FakeModel(_transcribe))

    asyncio.run(WhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="en"))

    assert not os.path.exists(captured_path["path"]), "temp file must be deleted after transcription"


def test_temp_file_extension_preserved_from_original_filename(monkeypatch):
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    captured_path = {}

    def _transcribe(path, **kw):
        captured_path["path"] = path
        return {"text": "hello"}

    monkeypatch.setattr(whisper, "load_model", lambda name, device=None: _FakeModel(_transcribe))

    asyncio.run(
        WhisperSTT().transcribe(audio_bytes=b"x", filename="recording.webm", content_type="audio/webm", language="en")
    )

    assert captured_path["path"].endswith(".webm")
