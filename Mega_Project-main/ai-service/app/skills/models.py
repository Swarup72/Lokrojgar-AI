from typing import Optional

from pydantic import Field

from app.models.common import AIBaseModel, MultilingualName


class CatalogSkillEntry(AIBaseModel):
    """
    One active Skill catalog entry, exactly as Node supplies it for
    semantic resolution. The resolver may ONLY select an id from the
    entries it is actually given here - it never invents one.
    """

    id: str
    name: MultilingualName


class SkillResolutionResult(AIBaseModel):
    """
    Structured result for one raw skill phrase. `canonical_skill_id` is
    guaranteed (by semantic_resolver.py, not by trusting the LLM) to be
    either null or an id that was present in the CatalogSkillEntry list
    supplied for that request - never a fabricated id.
    """

    raw_skill: str = Field(alias="rawSkill")
    resolved: bool
    canonical_skill_id: Optional[str] = Field(default=None, alias="canonicalSkillId")
    canonical_skill_name: Optional[str] = Field(default=None, alias="canonicalSkillName")
    confidence: float = Field(ge=0, le=1)
    reason: str
