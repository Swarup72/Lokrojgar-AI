import asyncio
from types import SimpleNamespace

import pytest
from sarvamai.core.api_error import ApiError

from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError
from app.voice.sarvam_stt import SarvamSTT, _resolve_language_code


class _FakeSpeechToText:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.calls = []

    async def transcribe(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return self._response


class _FakeClient:
    def __init__(self, speech_to_text):
        self.speech_to_text = speech_to_text


def _patch_client(monkeypatch, client):
    monkeypatch.setattr("app.voice.sarvam_stt.get_sarvam_client", lambda: client)


# --- _resolve_language_code() ----------------------------------------------


def test_resolve_language_code_maps_known_language():
    assert _resolve_language_code("mr") == "mr-IN"
    assert _resolve_language_code("hi") == "hi-IN"
    assert _resolve_language_code("en") == "en-IN"


def test_resolve_language_code_defaults_to_unknown_for_auto():
    assert _resolve_language_code("auto") == "unknown"


def test_resolve_language_code_defaults_to_unknown_for_empty():
    assert _resolve_language_code("") == "unknown"


def test_resolve_language_code_defaults_to_unknown_for_unrecognized():
    assert _resolve_language_code("fr") == "unknown"


# --- SarvamSTT.transcribe() -------------------------------------------------
# Confirms SarvamSTT's behavior through the STTProvider interface is
# unchanged from the original transcribe_audio() this migration moved it
# out of - same mocking approach (patch get_sarvam_client), same assertions.


def test_transcribe_success(monkeypatch):
    response = SimpleNamespace(transcript="मी एक प्लंबर आहे", language_probability=0.92)
    stt = _FakeSpeechToText(response=response)
    _patch_client(monkeypatch, _FakeClient(stt))

    transcript, confidence = asyncio.run(
        SarvamSTT().transcribe(audio_bytes=b"fake-audio", filename="a.wav", content_type="audio/wav", language="mr")
    )

    assert transcript == "मी एक प्लंबर आहे"
    assert confidence == 0.92
    assert stt.calls[0]["language_code"] == "mr-IN"
    assert stt.calls[0]["file"] == ("a.wav", b"fake-audio", "audio/wav")


def test_transcribe_raises_when_no_client(monkeypatch):
    _patch_client(monkeypatch, None)

    with pytest.raises(AiServiceUnavailableError):
        asyncio.run(
            SarvamSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="mr")
        )


def test_transcribe_raises_on_empty_transcript(monkeypatch):
    response = SimpleNamespace(transcript="", language_probability=None)
    _patch_client(monkeypatch, _FakeClient(_FakeSpeechToText(response=response)))

    with pytest.raises(ValueError):
        asyncio.run(
            SarvamSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="mr")
        )


def test_transcribe_wraps_api_error_as_provider_error(monkeypatch):
    error = ApiError(status_code=422, body="unsupported audio format")
    _patch_client(monkeypatch, _FakeClient(_FakeSpeechToText(error=error)))

    with pytest.raises(SarvamProviderError) as exc_info:
        asyncio.run(
            SarvamSTT().transcribe(audio_bytes=b"x", filename="a.wav", content_type="audio/wav", language="mr")
        )

    assert exc_info.value.status_code == 422
