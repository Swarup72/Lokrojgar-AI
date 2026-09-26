from typing import Literal, Optional

from pydantic import BaseModel

from app.ranking.rank import FACTOR_NAMES, RankingResult

FactorName = Literal["skill", "location", "availability", "pay", "rating", "relevance"]

_FACTOR_DISPLAY_NAMES: dict[str, str] = {
    "skill": "Skill compatibility",
    "location": "Location proximity",
    "availability": "Availability",
    "pay": "Pay compatibility",
    "rating": "Worker rating",
    "relevance": "Profile/job relevance",
}

# These are stable, factor-level facts about why a factor is unavailable in
# the CURRENT system, not per-instance guesses. Given a real WorkerProfile/
# Job pair (not a hand-crafted matcher call): pay is ALWAYS None because
# WorkerProfile.expected_pay has no declared unit (pay_match.py's v1
# limitation), and rating is None only when the worker has never been rated
# (rating_avg == 0 is the only way a real WorkerProfile reaches it, since
# ge=0/le=5 rules out anything else). Neither case is a bad score - both are
# "no comparison/no data," worded to avoid implying incompatibility or a
# poor rating.
_UNAVAILABLE_REASONS: dict[str, str] = {
    "pay": (
        "Pay compatibility is unavailable: the worker's expected pay has no "
        "declared unit in the current schema, so it cannot be safely "
        "compared to the job's offered pay. This does not mean the pay is "
        "incompatible - no comparison could be made at all."
    ),
    "rating": (
        "Worker rating is unavailable: the worker has not received any "
        "ratings yet. This is not a poor or low rating - there is simply no "
        "rating on record to evaluate."
    ),
}

_DEFAULT_UNAVAILABLE_REASON = "This factor could not be computed for this pair."


class FactorExplanation(BaseModel):
    factor: FactorName
    available: bool
    score: Optional[float]
    summary: str


class MatchExplanation(BaseModel):
    overall_score: Optional[float]
    factors: list[FactorExplanation]
    summary: str


def _explain_factor(factor: str, score: Optional[float]) -> FactorExplanation:
    if score is None:
        reason = _UNAVAILABLE_REASONS.get(factor, _DEFAULT_UNAVAILABLE_REASON)
        return FactorExplanation(factor=factor, available=False, score=None, summary=reason)

    display_name = _FACTOR_DISPLAY_NAMES.get(factor, factor)
    summary = f"{display_name} scored {score:.1f} out of 100."
    return FactorExplanation(factor=factor, available=True, score=score, summary=summary)


def _summarize_overall(ranking: RankingResult) -> str:
    if ranking.overall_score is None:
        return (
            "Overall match score is unavailable: no factors could be "
            "evaluated for this pair."
        )

    total_count = len(FACTOR_NAMES)
    available_count = len(ranking.available_factors)

    if ranking.unavailable_factors:
        unavailable_list = ", ".join(ranking.unavailable_factors)
        return (
            f"Overall match score: {ranking.overall_score:.1f} out of 100, "
            f"based on {available_count} of {total_count} factors "
            f"({unavailable_list} unavailable)."
        )

    return (
        f"Overall match score: {ranking.overall_score:.1f} out of 100, "
        f"based on all {total_count} factors."
    )


def explain_ranking_result(ranking: RankingResult) -> MatchExplanation:
    """
    Convert an existing RankingResult into a deterministic, human-readable
    explanation.

    This does not recompute any score - it only reads ranking.overall_score,
    ranking.match_factors, ranking.available_factors, and
    ranking.unavailable_factors, all of which are already computed. Factor
    order always follows FACTOR_NAMES (skill, location, availability, pay,
    rating, relevance), regardless of how MatchFactors happened to be built.
    """

    factor_explanations = [
        _explain_factor(factor_name, getattr(ranking.match_factors, factor_name))
        for factor_name in FACTOR_NAMES
    ]

    return MatchExplanation(
        overall_score=ranking.overall_score,
        factors=factor_explanations,
        summary=_summarize_overall(ranking),
    )
