import logging
import os

from app.extraction.interface import ExtractionProvider
from app.extraction.local_llm_extractor import LocalLLMExtractor
from app.extraction.models import ExtractedProfile
from app.extraction.number_grounding import is_grounded
from app.extraction.sarvam_extractor import SarvamExtractor
from app.sarvam.errors import AiServiceUnavailableError

logger = logging.getLogger(__name__)

# local_llm (mlx-lm, Apple Silicon only) is the production default for the
# local voice pipeline, matching the STT migration's mlx_whisper default -
# sarvam remains available as a fallback/compatibility provider.
DEFAULT_EXTRACTION_PROVIDER = "local_llm"

_PROVIDERS = {
    "local_llm": LocalLLMExtractor,
    "sarvam": SarvamExtractor,
}


def get_extraction_provider() -> ExtractionProvider:
    """
    Reads EXTRACTION_PROVIDER fresh on every call, mirroring
    app/voice/transcription.py's get_stt_provider() exactly - same
    fresh-env-read pattern, same hard-fail-on-typo behavior (an unknown
    provider name raises AiServiceUnavailableError rather than silently
    falling back to the default).
    """

    provider_name = os.environ.get("EXTRACTION_PROVIDER", DEFAULT_EXTRACTION_PROVIDER).strip().lower()
    provider_class = _PROVIDERS.get(provider_name)
    if provider_class is None:
        raise AiServiceUnavailableError(
            f"Unknown EXTRACTION_PROVIDER={provider_name!r} - expected one of {sorted(_PROVIDERS)}."
        )
    return provider_class()


async def extract_profile_from_transcript(transcript: str) -> ExtractedProfile:
    """
    Provider-agnostic entry point used by app/api/voice.py. Signature and
    return contract (an ExtractedProfile) are unchanged from before this
    migration - only which provider actually runs is new, controlled
    entirely by EXTRACTION_PROVIDER. The API route and Node do not know or
    care whether Sarvam or a local LLM produced the profile.
    """

    provider = get_extraction_provider()
    profile = await provider.extract(transcript)
    return _drop_ungrounded_numbers(profile, transcript)


# Numeric fields only. Names, cities and skills are deliberately NOT checked
# this way: they are free text that the model legitimately re-spells or
# normalizes, so a containment test would discard correct values.
_GROUNDED_NUMERIC_FIELDS = ("experience_years", "expected_pay")


def _drop_ungrounded_numbers(
    profile: ExtractedProfile, transcript: str
) -> ExtractedProfile:
    """
    Replace any numeric field the transcript does not actually state with
    None.

    On a clean transcript the model converts Marathi/Hindi/English number
    words correctly, so this changes nothing. It matters when speech-to-text
    garbles the audio: a real session transcribed as "...आच्छे रूपे एट हंडेट
    रूपीज..." (eight hundred, said twice) returned expectedPay = 10000, a
    number absent from the transcript, which was then shown to the worker as
    their own rate. An empty field the worker fills in is recoverable; a
    confident wrong number silently saved to their profile is not.

    This only ever clears a value - it never invents, rounds or repairs one,
    so the "pay must be explicitly stated" rule still holds.
    """

    replacements = {}
    for field in _GROUNDED_NUMERIC_FIELDS:
        value = getattr(profile, field)
        if value is not None and not is_grounded(value, transcript):
            logger.warning(
                "Dropping %s=%s: no such number appears in the transcript "
                "(likely a garbled speech-to-text result).",
                field,
                value,
            )
            replacements[field] = None

    if not replacements:
        return profile
    return profile.model_copy(update=replacements)
