import logging
from typing import Optional, Tuple

from app.sarvam.client import LANGUAGE_CODE_MAP, SARVAM_STT_MODEL, get_sarvam_client, with_sarvam_retry
from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError
from sarvamai.core.api_error import ApiError as SarvamApiError

logger = logging.getLogger(__name__)


def _resolve_language_code(language: str) -> str:
    if not language or language == "auto":
        return "unknown"
    return LANGUAGE_CODE_MAP.get(language, "unknown")


async def transcribe_audio(
    audio_bytes: bytes,
    filename: Optional[str],
    content_type: Optional[str],
    language: str,
) -> Tuple[str, Optional[float]]:
    """
    Transcribe Marathi/Hindi/English audio via Sarvam speech-to-text.

    audio_bytes is passed directly to the SDK as a (filename, bytes,
    content_type) tuple - confirmed by inspecting the installed SDK's own
    file-handling helper (app/sarvam/core/file.py mirrors httpx's own file
    upload convention) that this is the correct, safe form for raw binary
    content. No temp file is needed on this side.

    Returns (transcript, confidence) where confidence is Sarvam's own
    real language_probability (only populated when Sarvam actually
    performed language detection - null when a specific, non-"unknown"
    language_code was requested) - never a fabricated constant.
    """

    client = get_sarvam_client()
    if client is None:
        raise AiServiceUnavailableError("Sarvam AI is not configured (SARVAM_API_KEY missing).")

    try:
        response = await with_sarvam_retry(
            lambda: client.speech_to_text.transcribe(
                file=(filename, audio_bytes, content_type),
                model=SARVAM_STT_MODEL,
                language_code=_resolve_language_code(language),
            )
        )
    except SarvamApiError as error:
        raise SarvamProviderError(str(error), status_code=error.status_code) from error

    if not response.transcript:
        raise ValueError("Sarvam speech-to-text returned an empty transcript.")

    return response.transcript, response.language_probability
