from fastapi.testclient import TestClient

from app.extraction.models import ExtractedProfile
from app.main import app
from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError

client = TestClient(app)

_FAKE_PROFILE = ExtractedProfile(fullName="Ramesh Patil", skills=["plumbing"])


def _patch_success(monkeypatch, transcript="मी प्लंबर आहे", confidence=0.9, profile=_FAKE_PROFILE):
    async def fake_transcribe(**kwargs):
        return transcript, confidence

    async def fake_extract(transcript):
        return profile

    monkeypatch.setattr("app.api.voice.transcribe_audio", fake_transcribe)
    monkeypatch.setattr("app.api.voice.extract_profile_from_transcript", fake_extract)


def _patch_transcribe_raises(monkeypatch, error):
    async def fake_transcribe(**kwargs):
        raise error

    monkeypatch.setattr("app.api.voice.transcribe_audio", fake_transcribe)


def _upload(**extra):
    files = {"audio": ("clip.wav", b"fake-audio-bytes", "audio/wav")}
    data = {"language": "mr"}
    data.update(extra)
    return client.post("/voice/extract", files=files, data=data)


def test_voice_extract_success(monkeypatch):
    _patch_success(monkeypatch)

    response = _upload()

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == "मी प्लंबर आहे"
    assert body["confidence"] == 0.9
    assert body["extracted_profile"]["fullName"] == "Ramesh Patil"
    assert body["extracted_profile"]["skills"] == ["plumbing"]


def test_voice_extract_defaults_language_to_mr(monkeypatch):
    captured = {}

    async def fake_transcribe(**kwargs):
        captured.update(kwargs)
        return "transcript", None

    async def fake_extract(transcript):
        return _FAKE_PROFILE

    monkeypatch.setattr("app.api.voice.transcribe_audio", fake_transcribe)
    monkeypatch.setattr("app.api.voice.extract_profile_from_transcript", fake_extract)

    response = client.post("/voice/extract", files={"audio": ("clip.wav", b"x", "audio/wav")})

    assert response.status_code == 200
    assert captured["language"] == "mr"


def test_voice_extract_missing_audio_returns_422():
    response = client.post("/voice/extract", data={"language": "mr"})

    assert response.status_code == 422


def test_voice_extract_oversized_audio_returns_413(monkeypatch):
    monkeypatch.setattr("app.api.voice.MAX_AUDIO_BYTES", 4)

    response = _upload()

    assert response.status_code == 413


def test_voice_extract_service_unavailable_returns_503(monkeypatch):
    _patch_transcribe_raises(monkeypatch, AiServiceUnavailableError("no key"))

    response = _upload()

    assert response.status_code == 503


def test_voice_extract_provider_error_4xx_passed_through(monkeypatch):
    _patch_transcribe_raises(monkeypatch, SarvamProviderError("bad audio", status_code=422))

    response = _upload()

    assert response.status_code == 422


def test_voice_extract_provider_error_5xx_maps_to_502(monkeypatch):
    _patch_transcribe_raises(monkeypatch, SarvamProviderError("upstream down", status_code=500))

    response = _upload()

    assert response.status_code == 502


def test_voice_extract_value_error_maps_to_502(monkeypatch):
    _patch_transcribe_raises(monkeypatch, ValueError("empty transcript"))

    response = _upload()

    assert response.status_code == 502


def test_voice_extract_requires_api_key_when_configured(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")
    _patch_success(monkeypatch)

    response = _upload()

    assert response.status_code == 401


def test_voice_extract_with_valid_api_key_succeeds(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")
    _patch_success(monkeypatch)

    response = client.post(
        "/voice/extract",
        files={"audio": ("clip.wav", b"fake-audio-bytes", "audio/wav")},
        data={"language": "mr"},
        headers={"X-AI-Service-Key": "secret123"},
    )

    assert response.status_code == 200
