from typing import Annotated, List, Literal, Optional

from pydantic import ConfigDict, Field

from app.models.common import AIBaseModel

NonEmptyStr = Annotated[str, Field(min_length=1)]


class ExtractedProfile(AIBaseModel):
    """
    Pydantic port of the removed backend2/voiceExtractionSchema.js's
    extractedProfileZodSchema - defensive re-validation of Sarvam's parsed
    JSON response, run even though the request already asked for strict
    schema adherence (an external API's guarantee is never trusted blindly
    at a validation boundary). extra="forbid" mirrors Zod's .strict().

    Lives here (not app/models/) for the same reason RankingResult lives in
    app/ranking/rank.py rather than app/models/: app/models/ mirrors
    backend2's Mongoose schemas, and this is an algorithm output, not a
    schema mirror.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    full_name: Optional[NonEmptyStr] = Field(default=None, alias="fullName")
    experience_years: Optional[float] = Field(default=None, alias="experienceYears", ge=0)
    expected_pay: Optional[float] = Field(default=None, alias="expectedPay", ge=0)
    skills: Optional[List[NonEmptyStr]] = None
    city: Optional[NonEmptyStr] = None
    bio: Optional[NonEmptyStr] = None
    availability: Optional[Literal["available", "busy", "unavailable"]] = None
    languages: Optional[List[Literal["mr", "hi", "en"]]] = None
    preferred_job_categories: Optional[List[NonEmptyStr]] = Field(
        default=None, alias="preferredJobCategories"
    )
