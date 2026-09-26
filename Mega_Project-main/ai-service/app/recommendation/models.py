from typing import Literal

from pydantic import BaseModel

from app.ranking.rank import RankingResult


class PairMatchResult(BaseModel):
    """One scored worker/job pair, produced by score_worker_job_pair().

    Keeps the complete RankingResult (including MatchFactors) intact so a
    later explanation layer can use it - this is not a reshaped/reduced
    view of the ranking, just that ranking plus the identifiers needed to
    know which pair it belongs to.
    """

    worker_id: str
    job_id: str
    ranking: RankingResult


class RecommendationResult(BaseModel):
    """The ranked output of one recommendation request, in either direction."""

    anchor_id: str
    direction: Literal["worker_to_jobs", "job_to_workers"]
    matches: list[PairMatchResult]
