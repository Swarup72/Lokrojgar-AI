import asyncio
import os
import sys

import mlx_whisper
import pytest

from app.sarvam.errors import AiServiceUnavailableError
from app.voice.mlx_whisper_stt import DEFAULT_MLX_WHISPER_MODEL, MLXWhisperSTT


class _FakeTranscribeCall:
    def __init__(self, transcribe_fn):
        self._transcribe_fn = transcribe_fn
        self.calls = []

    def __call__(self, audio_path, **kwargs):
        self.calls.append({"audio_path": audio_path, **kwargs})
        return self._transcribe_fn(audio_path, **kwargs)


# --- initialization / laziness -----------------------------------------------


def test_provider_initializes_without_touching_mlx_whisper(monkeypatch):
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "should not be called"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    MLXWhisperSTT()

    assert fake.calls == []


def test_model_loading_happens_only_when_transcribe_is_called(monkeypatch):
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "hello"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    provider = MLXWhisperSTT()
    assert fake.calls == []

    asyncio.run(provider.transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="auto"))

    assert len(fake.calls) == 1


# --- model reuse across calls -------------------------------------------------


def test_repeated_calls_use_the_same_model_repo(monkeypatch):
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "hello"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    provider = MLXWhisperSTT()
    asyncio.run(provider.transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="mr"))
    asyncio.run(provider.transcribe(audio_bytes=b"y", filename="b.wav", content_type="audio/wav", language="hi"))

    assert len(fake.calls) == 2
    assert fake.calls[0]["path_or_hf_repo"] == fake.calls[1]["path_or_hf_repo"] == DEFAULT_MLX_WHISPER_MODEL


def test_model_repo_configurable_via_env(monkeypatch):
    monkeypatch.setenv("MLX_WHISPER_MODEL", "mlx-community/whisper-tiny")
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "hello"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    asyncio.run(
        MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="auto")
    )

    assert fake.calls[0]["path_or_hf_repo"] == "mlx-community/whisper-tiny"


# --- language / task -----------------------------------------------------------


def test_recognized_language_hints_are_forwarded_as_primary_conditioning(monkeypatch):
    # A recognized hint anchors the primary decoding language (real evidence:
    # mlx-whisper misdetected Gujarati during a real Marathi test with no
    # hint) - it is not a vocabulary restriction, so embedded English terms
    # can still appear in the transcript; that behavior is exercised by the
    # real audio tests, not this mocked unit test.
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "hello"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    for hint in ("mr", "hi", "en"):
        asyncio.run(
            MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language=hint)
        )

    assert [call["language"] for call in fake.calls] == ["mr", "hi", "en"]


def test_missing_or_unknown_language_falls_back_to_automatic_detection(monkeypatch):
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "hello"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    for hint in ("auto", "", "fr", "xx"):
        asyncio.run(
            MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language=hint)
        )

    assert all(call["language"] is None for call in fake.calls)


def test_uses_transcribe_task_never_translate(monkeypatch):
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "hello"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    asyncio.run(
        MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="mr")
    )

    assert fake.calls[0]["task"] == "transcribe"


# --- successful transcription --------------------------------------------------


def test_transcribe_success_returns_none_confidence(monkeypatch):
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "Plumber, 5 years experience"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    transcript, confidence = asyncio.run(
        MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="auto")
    )

    assert transcript == "Plumber, 5 years experience"
    assert confidence is None


# --- temp file lifecycle --------------------------------------------------------


def test_temp_file_exists_during_and_deleted_after_transcription(monkeypatch):
    captured_path = {}

    def _transcribe(path, **kw):
        captured_path["path"] = path
        assert os.path.exists(path), "temp file must exist while mlx-whisper is using it"
        return {"text": "hello"}

    monkeypatch.setattr(mlx_whisper, "transcribe", _FakeTranscribeCall(_transcribe))

    asyncio.run(
        MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="auto")
    )

    assert not os.path.exists(captured_path["path"]), "temp file must be deleted after transcription"


def test_temp_file_extension_preserved_from_original_filename(monkeypatch):
    captured_path = {}

    def _transcribe(path, **kw):
        captured_path["path"] = path
        return {"text": "hello"}

    monkeypatch.setattr(mlx_whisper, "transcribe", _FakeTranscribeCall(_transcribe))

    asyncio.run(
        MLXWhisperSTT().transcribe(
            audio_bytes=b"x", filename="recording.webm", content_type="audio/webm", language="auto"
        )
    )

    assert captured_path["path"].endswith(".webm")


# --- failure handling ------------------------------------------------------------


def test_transcribe_empty_audio_bytes_raises_without_calling_mlx_whisper(monkeypatch):
    fake = _FakeTranscribeCall(lambda path, **kw: {"text": "should not run"})
    monkeypatch.setattr(mlx_whisper, "transcribe", fake)

    with pytest.raises(ValueError):
        asyncio.run(
            MLXWhisperSTT().transcribe(audio_bytes=b"", filename="a.wav", content_type="audio/wav", language="auto")
        )

    assert fake.calls == []


def test_transcribe_empty_transcript_raises_valueerror(monkeypatch):
    monkeypatch.setattr(mlx_whisper, "transcribe", _FakeTranscribeCall(lambda path, **kw: {"text": "   "}))

    with pytest.raises(ValueError):
        asyncio.run(
            MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="auto")
        )


def test_transcribe_raises_valueerror_when_mlx_whisper_call_fails(monkeypatch):
    def _raise(path, **kw):
        raise RuntimeError("mlx runtime error")

    monkeypatch.setattr(mlx_whisper, "transcribe", _FakeTranscribeCall(_raise))

    with pytest.raises(ValueError):
        asyncio.run(
            MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="auto")
        )


def test_transcribe_raises_ai_service_unavailable_when_mlx_whisper_not_importable(monkeypatch):
    monkeypatch.setitem(sys.modules, "mlx_whisper", None)

    with pytest.raises(AiServiceUnavailableError):
        asyncio.run(
            MLXWhisperSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="auto")
        )
