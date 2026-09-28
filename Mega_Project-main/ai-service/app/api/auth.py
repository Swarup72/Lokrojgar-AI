import os
from typing import Optional

from fastapi import Header, HTTPException


def verify_api_key(x_ai_service_key: Optional[str] = Header(default=None)) -> None:
    """
    Gate every AI-service endpoint behind AI_SERVICE_API_KEY, read fresh on
    every request (not cached at import time) so tests/deployments can
    configure it without restarting the process.

    If no key is configured, requests are allowed - this is meant for
    local development, where there's nothing to check against.

    Shared by app/api/recommendations.py, app/api/voice.py, and
    app/api/translation.py - extracted here (moved from
    recommendations.py, unchanged behavior) so all three routers reuse the
    same check rather than each defining their own copy.
    """

    configured_key = os.environ.get("AI_SERVICE_API_KEY", "")
    if not configured_key:
        return

    if x_ai_service_key != configured_key:
        raise HTTPException(status_code=401, detail="Missing or invalid AI service API key")
