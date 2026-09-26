from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from app.models.common import AIBaseModel


class WorkerSkill(AIBaseModel):
    """Mirrors models/workerSkill.model.js.

    This is the join entity between WorkerProfile and Skill - it exists so
    a worker's claim to a skill (and whether that claim is verified) is
    tracked separately from the skill taxonomy and separately from the
    worker's own profile fields.
    """

    worker_skill_id: Optional[str] = Field(default=None, alias="_id")

    worker_id: str = Field(alias="workerId")

    skill_id: str = Field(alias="skillId")

    proficiency: Literal["beginner", "intermediate", "expert"]

    verification_status: Literal[
        "unverified", "pending", "verified", "revoked"
    ] = Field(default="unverified", alias="verificationStatus")

    evidence_job_ids: list[str] = Field(default_factory=list, alias="evidenceJobIds")

    verified_at: Optional[datetime] = Field(default=None, alias="verifiedAt")

    verified_by_admin_id: Optional[str] = Field(
        default=None, alias="verifiedByAdminId"
    )
