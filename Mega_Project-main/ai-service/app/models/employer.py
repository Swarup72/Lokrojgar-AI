from typing import Optional

from pydantic import Field

from app.models.common import AIBaseModel


class EmployerProfile(AIBaseModel):
    """Partial mirror of models/employerProfile.model.js.

    Intentionally NOT a full copy of the backend schema - userId and
    location are omitted because nothing in Modules 2-5 currently reads
    them (Job carries its own worksite location independently of the
    employer's own address). Only fields plausibly useful for job
    understanding/recommendation/trust are included. Revisit if a future
    AI feature needs more.
    """

    employer_id: Optional[str] = Field(default=None, alias="_id")

    business_name: str = Field(alias="businessName")

    business_type: str = Field(alias="businessType")

    rating_avg: float = Field(default=0, alias="ratingAvg", ge=0, le=5)
