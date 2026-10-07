import asyncio
import json
import logging

from pydantic import ValidationError

from app.extraction.interface import ExtractionProvider
from app.extraction.local_llm_runtime import LocalLLMRuntime
from app.extraction.models import ExtractedProfile
from app.extraction.prompts import EXTRACTION_SYSTEM_PROMPT

from app.runtime.inference_gate import run_exclusive

logger = logging.getLogger(__name__)

# Sarvam's extractor gets its JSON shape enforced server-side via
# response_format={"type":"json_schema",...} (see schema.py) - a local
# model has no equivalent guided-decoding step here, so the exact shape is
# spelled out explicitly in the prompt instead. The semantic field rules
# ("only what was explicitly stated", "convert number-words to digits",
# etc.) still come from the one shared EXTRACTION_SYSTEM_PROMPT so both
# providers are held to the identical extraction contract.
_JSON_SHAPE_INSTRUCTIONS = """
Respond with ONLY a single JSON object - no markdown code fences, no \
commentary before or after it - matching exactly this shape. Every key \
must be present; use null for anything not explicitly stated:

{
  "fullName": string or null,
  "experienceYears": number or null,
  "expectedPay": number or null,
  "skills": array of strings or null,
  "city": string or null,
  "bio": string or null,
  "availability": "available" or "busy" or "unavailable" or null,
  "languages": array containing only "mr", "hi", "en" or null,
  "preferredJobCategories": array of strings or null
}"""

LOCAL_LLM_SYSTEM_PROMPT = EXTRACTION_SYSTEM_PROMPT + "\n" + _JSON_SHAPE_INSTRUCTIONS


def _extract_json_object(text: str) -> str:
    """
    Unlike Sarvam's strict json_schema mode, a local instruct model isn't
    guaranteed to emit ONLY a JSON object - it may wrap it in markdown code
    fences or add a short preamble/epilogue. This extracts the first
    top-level {...} span without attempting any semantic repair; if there
    isn't one, the json.loads() call below fails cleanly rather than this
    function guessing at intent.
    """
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return text
    return text[start : end + 1]


class LocalLLMExtractor(ExtractionProvider):
    """
    Local, offline structured-profile extraction via a small instruct LLM
    running through Apple's MLX runtime (mlx-lm) - no SARVAM_API_KEY, no
    network call. Uses the same ExtractedProfile schema and the same
    field-level semantic rules (EXTRACTION_SYSTEM_PROMPT) as SarvamExtractor,
    so both providers are held to an identical extraction contract; only
    the JSON-shape enforcement mechanism differs (schema-guided decoding
    server-side for Sarvam vs. prompt instructions + post-hoc Pydantic
    validation here).

    Model loading/caching is delegated to LocalLLMRuntime (shared with
    semantic skill resolution) rather than owned here, so the ~4GB model is
    loaded at most once per process regardless of how many local-LLM
    features are in use.
    """

    async def extract(self, transcript: str) -> ExtractedProfile:
        if not transcript or not transcript.strip():
            raise ValueError("Transcript is empty.")

        # Same shared gate as Whisper: on this machine both models contend for
        # one GPU and the same unified memory, so a per-model gate would still
        # let one of each run together. The prompt, token budget and model are
        # untouched.
        raw_output = await run_exclusive(
            "qwen.extract_profile",
            lambda: asyncio.to_thread(
                LocalLLMRuntime.generate, LOCAL_LLM_SYSTEM_PROMPT, transcript, 512
            ),
        )

        json_text = _extract_json_object(raw_output)
        try:
            parsed = json.loads(json_text)
        except json.JSONDecodeError as error:
            raise ValueError("Local LLM returned malformed JSON for profile extraction.") from error

        try:
            return ExtractedProfile(**parsed)
        except ValidationError as error:
            logger.error("Local LLM voice profile extraction failed schema validation: %s", error)
            raise ValueError("Extracted profile failed validation.") from error
