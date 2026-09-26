from typing import Optional

from pydantic import Field

from app.models.common import AIBaseModel


class Rating(AIBaseModel):
    """Mirrors models/rating.model.js.

    Replaces the old standalone Review model. The backend has no separate
    review persistence - a rating and its optional written review are the
    same document, from one user to another, tied to a specific job.
    """

    rating_id: Optional[str] = Field(default=None, alias="_id")

    job_id: str = Field(alias="jobId")

    from_user_id: str = Field(alias="fromUserId")

    to_user_id: str = Field(alias="toUserId")

    rating: float = Field(ge=1, le=5)

    review: Optional[str] = None
