from typing import Optional

from pydantic import Field

from app.models.common import AIBaseModel, MultilingualName


class Skill(AIBaseModel):
    """Mirrors models/skill.model.js.

    A Skill is a shared taxonomy entry (e.g. "Plumber"), not something
    owned by a single worker. WorkerSkill links a worker to one of these.
    """

    skill_id: Optional[str] = Field(default=None, alias="_id")

    name: MultilingualName

    category_id: str = Field(alias="categoryId")

    is_active: bool = Field(default=True, alias="isActive")
