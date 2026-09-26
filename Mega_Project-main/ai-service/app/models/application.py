from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from app.models.common import AIBaseModel


class MatchFactors(AIBaseModel):
    """The sub-scores behind an Application's matchScore.

    No weights or formulas here on purpose - this is just the container
    shape the recommendation engine will eventually populate. Each factor
    is optional because a factor may not have been computed yet.
    """

    skill: Optional[float] = None
    location: Optional[float] = None
    availability: Optional[float] = None
    pay: Optional[float] = None
    rating: Optional[float] = None
    relevance: Optional[float] = None


class Application(AIBaseModel):
    """Mirrors models/application.model.js.

    Represents a worker applying to a job. matchScore/matchFactors are the
    fields Module 4 (recommendation) will eventually write - the AI
    service doesn't compute them here, it just needs to know their shape.
    """

    application_id: Optional[str] = Field(default=None, alias="_id")

    job_id: str = Field(alias="jobId")

    worker_id: str = Field(alias="workerId")

    status: Literal[
        "applied", "shortlisted", "accepted", "rejected", "completed", "withdrawn"
    ] = "applied"

    proposed_pay: Optional[float] = Field(default=None, alias="proposedPay", ge=0)

    applied_at: Optional[datetime] = Field(default=None, alias="appliedAt")

    match_score: Optional[float] = Field(
        default=None, alias="matchScore", ge=0, le=100
    )

    match_factors: Optional[MatchFactors] = Field(
        default=None, alias="matchFactors"
    )
