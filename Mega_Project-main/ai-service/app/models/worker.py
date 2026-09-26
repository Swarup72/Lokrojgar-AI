from typing import Literal, Optional

from pydantic import Field

from app.models.common import AIBaseModel, GeoPoint, MultilingualText


class WorkerProfile(AIBaseModel):
    """Mirrors models/workerProfile.model.js.

    This holds the worker's own profile fields only. Skills are NOT stored
    here - they live in separate WorkerSkill rows (worker -> skill ->
    proficiency/verification), each pointing at a Skill from the shared
    taxonomy. See worker_skill.py / skill.py.

    Note on `bio`: the live backend2 schema now defines it cleanly as
    `{ mr, hi, en }`, each an independently optional String - the earlier
    `type`-key ambiguity found during the original schema alignment has
    since been fixed on the Node side. Modelled here as MultilingualText
    to match that current, confirmed structure.
    """

    worker_id: Optional[str] = Field(default=None, alias="_id")

    user_id: str = Field(alias="userId")

    full_name: str = Field(alias="fullName")

    bio: Optional[MultilingualText] = None

    location: GeoPoint

    availability: Literal["available", "busy", "unavailable"] = "available"

    expected_pay: Optional[float] = Field(default=None, alias="expectedPay", ge=0)

    rating_avg: float = Field(default=0, alias="ratingAvg", ge=0, le=5)

    rating_count: int = Field(default=0, alias="ratingCount", ge=0)

    languages: list[Literal["mr", "hi", "en"]] = Field(
        default_factory=lambda: ["mr"]
    )

    preferred_job_categories: list[str] = Field(
        default_factory=list, alias="preferredJobCategories"
    )

    preferred_work_radius_km: float = Field(
        default=20, alias="preferredWorkRadiusKm", ge=1
    )

    experience_years: float = Field(default=0, alias="experienceYears", ge=0)
