import logging
import os
from typing import Optional, Tuple

from app.sarvam.errors import AiServiceUnavailableError
from app.voice.interface import STTProvider
from app.voice.mlx_whisper_stt import MLXWhisperSTT
from app.voice.sarvam_stt import SarvamSTT
from app.voice.whisper_stt import WhisperSTT

logger = logging.getLogger(__name__)

# mlx_whisper (Metal/ANE-accelerated, Apple Silicon only) is the production
# default for the local voice pipeline - a controlled evaluation found it
# both faster and more accurate on code-switched audio than the openai-
# whisper/PyTorch providers below, which remain available as fallback/
# compatibility options (e.g. non-Apple-Silicon deployment targets).
DEFAULT_STT_PROVIDER = "mlx_whisper"

_PROVIDERS = {
    "mlx_whisper": MLXWhisperSTT,
    "whisper": WhisperSTT,
    "sarvam": SarvamSTT,
}


def get_stt_provider() -> STTProvider:
    """
    Reads STT_PROVIDER fresh on every call - same fresh-env-read pattern as
    get_sarvam_client() elsewhere in this codebase - so tests and local
    development can switch providers without restarting the process.

    An unrecognized value raises rather than silently falling back to a
    default: a typo'd STT_PROVIDER is a real configuration mistake that
    should surface clearly (mapped to a clean 503 by the API route via
    AiServiceUnavailableError), not be masked by quietly using whichever
    provider happens to be the default.
    """

    provider_name = os.environ.get("STT_PROVIDER", DEFAULT_STT_PROVIDER).strip().lower()
    provider_class = _PROVIDERS.get(provider_name)
    if provider_class is None:
        raise AiServiceUnavailableError(
            f"Unknown STT_PROVIDER={provider_name!r} - expected one of {sorted(_PROVIDERS)}."
        )
    return provider_class()


async def transcribe_audio(
    audio_bytes: bytes,
    filename: Optional[str],
    content_type: Optional[str],
    language: str,
) -> Tuple[str, Optional[float]]:
    """
    Provider-agnostic entry point used by app/api/voice.py. Signature and
    return contract (transcript, confidence) are unchanged from before this
    migration - only which provider actually runs is new, controlled
    entirely by STT_PROVIDER. Neither the API route nor Node need to know
    or care whether Whisper or Sarvam produced the transcript.
    """

    provider = get_stt_provider()
    return await provider.transcribe(
        audio_bytes=audio_bytes,
        filename=filename,
        content_type=content_type,
        language=language,
    )
