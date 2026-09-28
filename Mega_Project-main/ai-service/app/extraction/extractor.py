import json
import logging

from pydantic import ValidationError
from sarvamai.core.api_error import ApiError as SarvamApiError

from app.extraction.models import ExtractedProfile
from app.extraction.prompts import EXTRACTION_SYSTEM_PROMPT
from app.extraction.schema import EXTRACTED_PROFILE_JSON_SCHEMA
from app.sarvam.client import SARVAM_EXTRACTION_MODEL, get_sarvam_client, with_sarvam_retry
from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError

logger = logging.getLogger(__name__)


async def extract_profile_from_transcript(transcript: str) -> ExtractedProfile:
    """
    Extract structured worker-profile fields from a transcript via Sarvam's
    chat completions endpoint, using strict JSON-schema structured output.

    No score/field is invented: the JSON Schema requires every field but
    allows null, and the follow-up Pydantic validation is defensive
    re-validation of an external API's response, never trusted blindly.
    """

    client = get_sarvam_client()
    if client is None:
        raise AiServiceUnavailableError("Sarvam AI is not configured (SARVAM_API_KEY missing).")

    try:
        response = await with_sarvam_retry(
            lambda: client.chat.completions(
                model=SARVAM_EXTRACTION_MODEL,
                messages=[
                    {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": transcript},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "worker_profile_extraction",
                        "schema": EXTRACTED_PROFILE_JSON_SCHEMA,
                        "strict": True,
                    },
                },
                temperature=0,
            )
        )
    except SarvamApiError as error:
        raise SarvamProviderError(str(error), status_code=error.status_code) from error

    raw_content = response.choices[0].message.content if response.choices else None
    if not raw_content:
        raise ValueError("Sarvam chat completion returned no content.")

    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError as error:
        raise ValueError("Sarvam returned malformed JSON for profile extraction.") from error

    try:
        return ExtractedProfile(**parsed)
    except ValidationError as error:
        logger.error("Voice profile extraction failed schema validation: %s", error)
        raise ValueError("Extracted profile failed validation.") from error
