from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.api.auth import verify_api_key
from app.extraction.extractor import extract_profile_from_transcript
from app.extraction.models import ExtractedProfile
from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError
from app.voice.transcription import transcribe_audio

router = APIRouter()

# Matches multer's uploadAudio limit on the Node side (15 MB) - defense in
# depth against internal misuse, not a duplicate of multer's MIME allowlist
# (drift risk for low value, since only Node - gated by the API key - ever
# calls this endpoint).
MAX_AUDIO_BYTES = 15 * 1024 * 1024


class VoiceExtractionResponse(BaseModel):
    transcript: str
    extracted_profile: ExtractedProfile
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


def _raise_for_sarvam_failure(error: Exception) -> None:
    if isinstance(error, AiServiceUnavailableError):
        raise HTTPException(status_code=503, detail=str(error)) from error
    if isinstance(error, SarvamProviderError):
        status_code = error.status_code if error.status_code and error.status_code < 500 else 502
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    raise HTTPException(status_code=500, detail=str(error)) from error


@router.post(
    "/voice/extract",
    response_model=VoiceExtractionResponse,
    dependencies=[Depends(verify_api_key)],
)
async def extract_voice_profile(
    audio: UploadFile = File(...),
    language: str = Form(default="mr"),
) -> VoiceExtractionResponse:
    """
    Transcribe audio (Marathi/Hindi/English) and extract structured
    worker-profile fields from it. Thin HTTP boundary only - all actual
    logic lives in app/voice/transcription.py and
    app/extraction/extractor.py.
    """

    content = await audio.read()
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file exceeds the 15MB limit.")

    try:
        transcript, confidence = await transcribe_audio(
            audio_bytes=content,
            filename=audio.filename,
            content_type=audio.content_type,
            language=language,
        )
        extracted_profile = await extract_profile_from_transcript(transcript)
    except (AiServiceUnavailableError, SarvamProviderError) as error:
        _raise_for_sarvam_failure(error)
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return VoiceExtractionResponse(
        transcript=transcript,
        extracted_profile=extracted_profile,
        confidence=confidence,
    )
