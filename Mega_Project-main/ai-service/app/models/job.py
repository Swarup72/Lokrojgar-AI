from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from app.models.common import AIBaseModel, GeoPoint, MultilingualText


class Job(AIBaseModel):
    """Mirrors models/job.model.js.

    Replaces the old flattened Job (skills_required/wage_offered/job_type)
    with the real field names and structure: skills are referenced by
    skill_ids (pointing into the Skill taxonomy), pay is split into
    pay_type + pay_amount, and title/description are multilingual.

    status was widened to the live backend2 schema's full 7-value enum
    (the original alignment only had 4 values, which would reject real
    "draft"/"partially_assigned"/"expired" jobs). filled_workers was added
    alongside it because candidate eligibility for "partially_assigned"
    jobs depends on comparing it to required_workers - see
    app/recommendation/candidates.py.
    """

    job_id: Optional[str] = Field(default=None, alias="_id")

    employer_id: str = Field(alias="employerId")

    title: MultilingualText = Field(default_factory=MultilingualText)

    skill_ids: list[str] = Field(default_factory=list, alias="skillIds")

    location: GeoPoint

    pay_type: Literal["daily", "monthly", "fixed"] = Field(alias="payType")

    pay_amount: float = Field(alias="payAmount", ge=0)

    required_workers: int = Field(alias="requiredWorkers", ge=1)

    filled_workers: int = Field(default=0, alias="filledWorkers", ge=0)

    status: Literal[
        "draft",
        "open",
        "partially_assigned",
        "assigned",
        "completed",
        "cancelled",
        "expired",
    ] = "open"

    start_date: datetime = Field(alias="startDate")

    category_id: str = Field(alias="categoryId")

    description: MultilingualText = Field(default_factory=MultilingualText)

    original_language: Literal["mr", "hi", "en"] = Field(alias="originalLanguage")

    experience_required: float = Field(
        default=0, alias="experienceRequired", ge=0
    )

    preferred_languages: list[str] = Field(
        default_factory=list, alias="preferredLanguages"
    )

    application_deadline: Optional[datetime] = Field(
        default=None, alias="applicationDeadline"
    )

    start_time: Optional[str] = Field(default=None, alias="startTime")

    end_time: Optional[str] = Field(default=None, alias="endTime")

    shift_type: Literal["day", "night", "flexible"] = Field(
        default="flexible", alias="shiftType"
    )
