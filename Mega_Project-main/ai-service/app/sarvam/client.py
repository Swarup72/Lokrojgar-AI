import asyncio
import logging
import os
from typing import Awaitable, Callable, Optional, TypeVar

import httpx

from app.sarvam.errors import AiServiceUnavailableError, SarvamApiError

logger = logging.getLogger(__name__)

_cached_client: Optional[object] = None
_cached_api_key: Optional[str] = None

# docs.sarvam.ai/api/getting-started/models/saaras: "saaras:v3 (default,
# recommended)" vs "saaras:v4 (latest)" - v3 is the documented recommended
# production model; v4 (broader language coverage, 2026-09) is available by
# overriding the env var. Mirrors backend2's (now-removed) sarvam.client.js.
SARVAM_STT_MODEL = os.environ.get("SARVAM_STT_MODEL", "saaras:v3")

# sarvam-m is deprecated; sarvam-30b/sarvam-105b are the current supported
# chat models. sarvam-105b (128K context) is used for structured extraction.
SARVAM_EXTRACTION_MODEL = os.environ.get("SARVAM_EXTRACTION_MODEL", "sarvam-105b")

# mayura:v1 covers all three languages this project needs (mr-IN/hi-IN/en-IN).
SARVAM_TRANSLATION_MODEL = os.environ.get("SARVAM_TRANSLATION_MODEL", "mayura:v1")

# mr/hi/en are this project's own application-level codes; Sarvam's APIs use
# BCP-47-style codes.
LANGUAGE_CODE_MAP = {"mr": "mr-IN", "hi": "hi-IN", "en": "en-IN"}

_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

T = TypeVar("T")


def get_sarvam_client() -> Optional[object]:
    """
    Returns the shared async Sarvam client, or None when no API key is
    configured. Reads SARVAM_API_KEY fresh on every call (rather than
    baking it into a module-level constant at import time) so tests can
    configure/unconfigure it per-case, mirroring the same pattern already
    used for AI_SERVICE_API_KEY in app/api/auth.py. The underlying client
    instance is cached and reused as long as the key hasn't changed.

    Every caller must check for None explicitly and fail cleanly - there is
    no simulated/fake fallback: an unconfigured key means the feature is
    unavailable, not that it should pretend to work.
    """

    global _cached_client, _cached_api_key

    api_key = os.environ.get("SARVAM_API_KEY")

    if not api_key:
        _cached_client = None
        _cached_api_key = None
        return None

    if _cached_client is not None and _cached_api_key == api_key:
        return _cached_client

    # Imported here, not at module scope, so FastAPI can start on a machine
    # without the optional sarvamai SDK. A missing SDK surfaces as the same
    # clean "unavailable" error an unset SARVAM_API_KEY produces.
    try:
        from sarvamai import AsyncSarvamAI
    except ModuleNotFoundError as error:
        raise AiServiceUnavailableError(
            "Sarvam is configured (SARVAM_API_KEY is set) but the 'sarvamai' package is not installed."
        ) from error

    _cached_client = AsyncSarvamAI(api_subscription_key=api_key)
    _cached_api_key = api_key
    return _cached_client


async def with_sarvam_retry(
    fn: Callable[[], Awaitable[T]],
    retries: int = 2,
    delay_seconds: float = 0.5,
) -> T:
    """
    Retry a Sarvam SDK call a bounded number of times, only for genuinely
    transient failures (rate limiting, timeouts, upstream 5xx). Auth
    failures (401/403) and malformed-request errors (400/422) are never
    retried - retrying those would just waste time reproducing the same
    failure.

    The Python SDK's exception taxonomy is genuinely different from the JS
    SDK's (confirmed by inspecting the installed package, not assumed):
    typed subclasses of a single sarvamai.ApiError base class, each with a
    real `.status_code` attribute, plus httpx exceptions for network-level
    failures (timeouts, connection errors) that never reach the SDK's own
    error classes at all.
    """

    last_error: Optional[Exception] = None

    for attempt in range(retries + 1):
        try:
            return await fn()
        except (SarvamApiError, httpx.TimeoutException, httpx.ConnectError) as error:
            last_error = error

            is_timeout_or_connect = isinstance(error, (httpx.TimeoutException, httpx.ConnectError))
            status_code = getattr(error, "status_code", None)
            is_retryable = is_timeout_or_connect or status_code in _RETRYABLE_STATUS_CODES
            is_last_attempt = attempt == retries

            if not is_retryable or is_last_attempt:
                raise

            logger.warning(
                "Sarvam request failed (attempt %d/%d), retrying: status_code=%s error=%s",
                attempt + 1,
                retries + 1,
                status_code,
                error,
            )
            await asyncio.sleep(delay_seconds * (attempt + 1))

    assert last_error is not None
    raise last_error
