from typing import Any, Literal, Optional

from pydantic import Field

from app.models.common import AIBaseModel


class VoiceProfile(AIBaseModel):
    """Mirrors models/voiceProfile.model.js.

    Represents the output of Module 2's pipeline up to structured
    extraction: audio -> transcript -> extracted_fields. extracted_fields
    mirrors the backend's Mongoose `Mixed` type - its shape isn't fixed yet
    because Module 2 (information extraction) hasn't been designed, so a
    dict is the honest representation rather than forcing a premature
    schema onto it.
    """

    voice_profile_id: Optional[str] = Field(default=None, alias="_id")

    worker_id: str = Field(alias="workerId")

    language: Literal["mr", "hi", "en"]

    audio_url: str = Field(alias="audioUrl")

    transcript: Optional[str] = None

    extracted_fields: dict[str, Any] = Field(
        default_factory=dict, alias="extractedFields"
    )

    confidence: Optional[float] = Field(default=None, ge=0, le=1)
