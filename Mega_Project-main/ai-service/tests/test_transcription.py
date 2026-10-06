import asyncio
from types import SimpleNamespace

import pytest

from app.sarvam.errors import AiServiceUnavailableError
from app.voice.mlx_whisper_stt import MLXWhisperSTT
from app.voice.sarvam_stt import SarvamSTT
from app.voice.transcription import get_stt_provider, transcribe_audio
from app.voice.whisper_stt import WhisperSTT

# --- get_stt_provider() - provider selection --------------------------------


def test_defaults_to_mlx_whisper_when_unset(monkeypatch):
    monkeypatch.delenv("STT_PROVIDER", raising=False)
    assert isinstance(get_stt_provider(), MLXWhisperSTT)


def test_selects_mlx_whisper_explicitly(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "mlx_whisper")
    assert isinstance(get_stt_provider(), MLXWhisperSTT)


def test_selects_whisper_explicitly(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "whisper")
    assert isinstance(get_stt_provider(), WhisperSTT)


def test_selects_sarvam_explicitly(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "sarvam")
    assert isinstance(get_stt_provider(), SarvamSTT)


def test_provider_selection_is_case_insensitive(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "SARVAM")
    assert isinstance(get_stt_provider(), SarvamSTT)

    monkeypatch.setenv("STT_PROVIDER", "Whisper")
    assert isinstance(get_stt_provider(), WhisperSTT)


def test_provider_selection_tolerates_surrounding_whitespace(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "  sarvam  ")
    assert isinstance(get_stt_provider(), SarvamSTT)


def test_unknown_provider_raises_ai_service_unavailable(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "some-provider-that-does-not-exist")

    with pytest.raises(AiServiceUnavailableError):
        get_stt_provider()


# --- transcribe_audio() - dispatch behavior ---------------------------------


def test_transcribe_audio_delegates_to_the_selected_provider(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "whisper")
    captured = {}

    async def fake_transcribe(self, audio_bytes, filename, content_type, language):
        captured["called_with"] = (audio_bytes, filename, content_type, language)
        return "delegated transcript", 0.5

    monkeypatch.setattr(WhisperSTT, "transcribe", fake_transcribe)

    result = asyncio.run(
        transcribe_audio(audio_bytes=b"abc", filename="f.wav", content_type="audio/wav", language="hi")
    )

    assert result == ("delegated transcript", 0.5)
    assert captured["called_with"] == (b"abc", "f.wav", "audio/wav", "hi")


def test_transcribe_audio_with_sarvam_provider_still_works_through_the_abstraction(monkeypatch):
    """
    Confirms SarvamSTT remains fully reachable and functional through the
    new provider-agnostic transcribe_audio() dispatcher - Sarvam is being
    kept temporarily available, not silently broken by this migration.
    """

    monkeypatch.setenv("STT_PROVIDER", "sarvam")

    class _FakeSpeechToText:
        async def transcribe(self, **kwargs):
            return SimpleNamespace(transcript="सर्वम transcript", language_probability=0.8)

    class _FakeClient:
        speech_to_text = _FakeSpeechToText()

    monkeypatch.setattr("app.voice.sarvam_stt.get_sarvam_client", lambda: _FakeClient())

    transcript, confidence = asyncio.run(
        transcribe_audio(audio_bytes=b"abc", filename="f.wav", content_type="audio/wav", language="mr")
    )

    assert transcript == "सर्वम transcript"
    assert confidence == 0.8


def test_transcribe_audio_propagates_provider_exceptions_unchanged(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "whisper")

    async def fake_transcribe(self, **kwargs):
        raise ValueError("bad audio")

    monkeypatch.setattr(WhisperSTT, "transcribe", fake_transcribe)

    with pytest.raises(ValueError):
        asyncio.run(transcribe_audio(audio_bytes=b"abc", filename="f.wav", content_type="audio/wav", language="en"))
