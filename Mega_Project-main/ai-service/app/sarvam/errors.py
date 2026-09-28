from typing import Optional


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
