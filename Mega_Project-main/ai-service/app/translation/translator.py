import asyncio
import logging
from typing import Dict, Literal, Tuple


from app.sarvam.client import (
    LANGUAGE_CODE_MAP,
    SARVAM_TRANSLATION_MODEL,
    get_sarvam_client,
    with_sarvam_retry,
)
from app.sarvam.errors import AiServiceUnavailableError, SarvamApiError, SarvamProviderError

logger = logging.getLogger(__name__)

APP_LANGUAGES = ["mr", "hi", "en"]


async def translate_text_to_all_languages(
    text: str, source_lang: Literal["mr", "hi", "en"] = "en"
) -> Dict[str, str]:
    """
    Translate `text` directly into each of the OTHER two languages,
    never chained through one another (source -> hi and source -> mr run
    independently and concurrently via asyncio.gather), so neither
    accumulates the other's translation error - mirrors the removed
    backend2/translation.service.js's Promise.all approach exactly.

    Raises on failure rather than falling back internally: "never block
    the caller on translation failure" is a Node-side resilience policy
    (backend2's thin translation.service.js wrapper), not an intrinsic
    property of translation itself - this function's only job is to
    translate or clearly fail.
    """

    client = get_sarvam_client()
    if client is None:
        raise AiServiceUnavailableError("Sarvam AI is not configured (SARVAM_API_KEY missing).")

    result = {lang: (text if lang == source_lang else "") for lang in APP_LANGUAGES}
    source_code = LANGUAGE_CODE_MAP.get(source_lang, LANGUAGE_CODE_MAP["en"])
    target_languages = [lang for lang in APP_LANGUAGES if lang != source_lang]

    async def translate_one(target_lang: str) -> Tuple[str, str]:
        try:
            response = await with_sarvam_retry(
                lambda: client.text.translate(
                    input=text,
                    source_language_code=source_code,
                    target_language_code=LANGUAGE_CODE_MAP[target_lang],
                    model=SARVAM_TRANSLATION_MODEL,
                )
            )
        except SarvamApiError as error:
            raise SarvamProviderError(str(error), status_code=error.status_code) from error
        return target_lang, response.translated_text

    translations = await asyncio.gather(*(translate_one(lang) for lang in target_languages))

    for lang, translated_text in translations:
        result[lang] = translated_text

    logger.info("Translation completed: source_lang=%s targets=%s", source_lang, target_languages)
    return result
