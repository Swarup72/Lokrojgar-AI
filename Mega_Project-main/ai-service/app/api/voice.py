from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.api.auth import verify_api_key
from app.extraction.extractor import extract_profile_from_transcript
from app.extraction.field_extraction import DETERMINISTIC_FIELDS, LLM_FIELDS, extract_field
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


# The fields the GUIDED flow can capture by voice, one question at a time.
# "skills" is the only one that reaches the language model - see
# extract_voice_field below.
GUIDED_VOICE_FIELDS = sorted(set(DETERMINISTIC_FIELDS) | set(LLM_FIELDS))


class VoiceFieldResponse(BaseModel):
    """
    One guided step's outcome.

    `ok=False` with a `reason` is a normal, expected answer - it means "say that
    again", not that anything failed. The transcript is always returned so the UI
    can show the worker what was heard, which is what makes a retry informed
    rather than blind.
    """

    field: str
    transcript: str
    value: Optional[Any] = None
    ok: bool = False
    reason: str = ""
    candidates: List[float] = []
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    # True only for the skills step, so the caller can see - and tests can
    # assert - exactly where the one LLM call per guided session happened.
    used_llm: bool = False


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


@router.post(
    "/voice/extract-field",
    response_model=VoiceFieldResponse,
    dependencies=[Depends(verify_api_key)],
)
async def extract_voice_field(
    audio: UploadFile = File(...),
    language: str = Form(default="mr"),
    field: str = Form(...),
) -> VoiceFieldResponse:
    """
    Transcribe one short recording and extract ONE field from it.

    This is the guided flow's entry point. It exists alongside /voice/extract
    (the single-recording flow), which is unchanged - both share the same
    transcription path, the same frozen Whisper configuration and the same
    number-grounding guard.

    EXACTLY ONE field reaches the language model: "skills". Every other field is
    parsed deterministically by app/extraction/field_extraction.py, because a
    single-question recording has one semantic target and a warm Qwen call costs
    ~11-17s against ~3s for the transcription itself. A guided session therefore
    makes ONE Qwen call in total, at the skills step.
    """

    if field not in GUIDED_VOICE_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported field {field!r} - expected one of {GUIDED_VOICE_FIELDS}.",
        )

    content = await audio.read()
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file exceeds the 15MB limit.")
    if not content:
        raise HTTPException(status_code=400, detail="The recording is empty.")

    try:
        transcript, confidence = await transcribe_audio(
            audio_bytes=content,
            filename=audio.filename,
            content_type=audio.content_type,
            language=language,
        )
    except (AiServiceUnavailableError, SarvamProviderError) as error:
        _raise_for_sarvam_failure(error)
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    if field in LLM_FIELDS:
        # THE one language-model call of a guided session. It reuses the existing
        # extraction provider rather than adding a second prompt or provider, and
        # only its `skills` list is taken - the caller resolves those phrases
        # against the real catalog, so nothing here can invent a skill id.
        #
        # "jobSkills" (employer, guided job posting) runs the same way: the
        # skills an employer names for a job are the same catalog phrases a
        # worker names for a profile, so the same extraction answers both.
        try:
            profile = await extract_profile_from_transcript(transcript)
        except (AiServiceUnavailableError, SarvamProviderError) as error:
            _raise_for_sarvam_failure(error)
        except ValueError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

        skills = profile.skills or []
        return VoiceFieldResponse(
            field=field,
            transcript=transcript,
            value=skills or None,
            ok=bool(skills),
            reason="" if skills else "no_skills_found",
            confidence=confidence,
            used_llm=True,
        )

    result = extract_field(field, transcript)
    return VoiceFieldResponse(
        field=result.field,
        transcript=transcript,
        value=result.value,
        ok=result.ok,
        reason=result.reason,
        candidates=result.candidates,
        confidence=confidence,
        used_llm=False,
    )
