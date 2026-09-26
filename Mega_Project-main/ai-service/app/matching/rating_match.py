from typing import Optional

from pydantic import BaseModel


class RatingMatchResult(BaseModel):
    score: Optional[float]
    rating_available: bool
    rating_avg: Optional[float]
    reason: str


def calculate_rating_match(rating_avg: Optional[float]) -> RatingMatchResult:
    """
    Convert a worker's average rating into a 0-100 matching score.

    Cold-start handling (schema-driven, not assumed): WorkerProfile.rating_avg
    defaults to 0 for a worker who has never been rated, and that same field
    has no separate way to flag "unrated" versus "genuinely low." But every
    individual Rating is constrained to [1, 5] (Rating.rating: ge=1, le=5),
    so the average of one or more real ratings can never fall below 1.
    That makes rating_avg == 0 mathematically impossible as a real computed
    average - it can only mean "no ratings yet," which lets v1 tell the two
    cases apart without guessing.

    An unrated worker is reported as rating_available=False with no score,
    not as a 0/100 score - treating "unrated" as "worst possible" would
    unfairly penalize workers who simply haven't had a chance to be rated.
    """

    if rating_avg is None:
        return RatingMatchResult(
            score=None,
            rating_available=False,
            rating_avg=None,
            reason="No rating value was provided.",
        )

    if rating_avg == 0:
        return RatingMatchResult(
            score=None,
            rating_available=False,
            rating_avg=rating_avg,
            reason="Worker has not received any ratings yet.",
        )

    if rating_avg < 1 or rating_avg > 5:
        return RatingMatchResult(
            score=None,
            rating_available=False,
            rating_avg=rating_avg,
            reason=f"Rating {rating_avg} is outside the valid 1-5 range.",
        )

    score = ((rating_avg - 1) / 4) * 100

    return RatingMatchResult(
        score=score,
        rating_available=True,
        rating_avg=rating_avg,
        reason=f"Worker's average rating is {rating_avg}.",
    )
