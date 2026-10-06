from typing import Optional

# The Sarvam SDK is an OPTIONAL dependency. Sarvam backs the translation
# endpoint and the two non-default voice providers; the default voice
# pipeline (MLX Whisper + local Qwen) never touches it. Importing it at
# module scope meant a machine without `sarvamai` installed could not even
# START FastAPI, because app/main.py -> api/translation.py -> translator.py
# pulled it in at import time.
#
# Re-exported here so every call site can keep writing `except
# SarvamApiError` unchanged. The stand-in is only ever used when the SDK is
# absent - in which case no Sarvam call can be made, so nothing can raise
# the real class either. Same convention app/extraction/local_llm_runtime.py
# already uses for mlx-lm.
try:  # pragma: no cover - depends on whether the optional SDK is installed
    from sarvamai.core.api_error import ApiError as SarvamApiError
except ModuleNotFoundError:  # pragma: no cover
    class SarvamApiError(Exception):
        """Stand-in for sarvamai's ApiError when the SDK is not installed."""



class AiServiceUnavailableError(Exception):
    """Raised when Sarvam isn't configured at all (no SARVAM_API_KEY).

    Distinct from a real provider failure so callers (the API routers) can
    return a clean 503 without pretending a request was even attempted.
    """


class SarvamProviderError(Exception):
    """Raised when Sarvam responded with an error.

    Carries the real status_code from the SDK's ApiError so the API layer
    can decide whether to pass it through (4xx - the caller's request was
    bad) or map it to something else (5xx - Sarvam's own failure).
    """

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code
