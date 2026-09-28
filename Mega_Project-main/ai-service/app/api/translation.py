from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import verify_api_key
from app.sarvam.errors import AiServiceUnavailableError, SarvamProviderError
from app.translation.translator import translate_text_to_all_languages

router = APIRouter()


class TranslationRequest(BaseModel):
    text: str = Field(min_length=1)
    source_lang: Literal["mr", "hi", "en"] = "en"


class TranslationResponse(BaseModel):
    mr: str
    hi: str
    en: str


def _raise_for_sarvam_failure(error: Exception) -> None:
    if isinstance(error, AiServiceUnavailableError):
        raise HTTPException(status_code=503, detail=str(error)) from error
    if isinstance(error, SarvamProviderError):
        status_code = error.status_code if error.status_code and error.status_code < 500 else 502
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    raise HTTPException(status_code=500, detail=str(error)) from error


@router.post(
    "/translation/translate",
    response_model=TranslationResponse,
    dependencies=[Depends(verify_api_key)],
)
async def translate(request: TranslationRequest) -> TranslationResponse:
    """
    Translate `text` into all three app languages. Thin HTTP boundary only -
    the actual translation logic lives in app/translation/translator.py,
    which raises on failure rather than falling back (the "never block the
    caller" fallback policy is Node's translation.service.js wrapper's
    responsibility, not this service's).
    """

    try:
        translations = await translate_text_to_all_languages(request.text, request.source_lang)
    except (AiServiceUnavailableError, SarvamProviderError) as error:
        _raise_for_sarvam_failure(error)
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return TranslationResponse(**translations)
