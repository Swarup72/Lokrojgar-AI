from typing import Optional

from pydantic import BaseModel

from app.models.application import MatchFactors
from app.ranking.config import RankingWeights

FACTOR_NAMES = ["skill", "location", "availability", "pay", "rating", "relevance"]


class RankingResult(BaseModel):
    overall_score: Optional[float]
    match_factors: MatchFactors
    available_factors: list[str]
    unavailable_factors: list[str]


def calculate_ranking(
    match_factors: MatchFactors,
    weights: Optional[RankingWeights] = None,
) -> RankingResult:
    """
    Combine six independently-computed match factor scores into one
    overall score, using a weighted average.

    All six matchers already return scores on a 0-100 scale (verified by
    inspecting SkillMatchResult, LocationMatchResult,
    AvailabilityMatchResult, PayMatchResult, RatingMatchResult, and
    RelevanceMatchResult directly), so this function performs no
    0-1/0-100 rescaling - it only combines values already on a consistent
    scale. It does not recalculate any factor itself.

    A factor score of None means "could not be computed" (Pay's permanent
    v1 None, or Rating's cold-start None) and is excluded from BOTH the
    numerator and denominator - it is not treated as zero. A factor score
    of 0 is a real, computed result and participates normally, including
    in the denominator.

    If no factor is available (either because all six are None, or
    because the only available factors happen to have zero weight),
    there is nothing to average: overall_score is None - "unrankable",
    not "worst possible" (0) or "best possible" (100).
    """

    weights = weights or RankingWeights()

    available_factors: list[str] = []
    unavailable_factors: list[str] = []

    weighted_sum = 0.0
    weight_total = 0.0

    for factor_name in FACTOR_NAMES:
        score = getattr(match_factors, factor_name)
        weight = getattr(weights, factor_name)

        if score is None:
            unavailable_factors.append(factor_name)
            continue

        available_factors.append(factor_name)
        weighted_sum += score * weight
        weight_total += weight

    if weight_total == 0:
        overall_score = None
    else:
        overall_score = weighted_sum / weight_total
        # Mathematically redundant given non-negative weights and 0-100
        # inputs (a weighted average can't exceed its inputs' range), but
        # kept as an explicit guard per the "must remain 0-100" requirement.
        overall_score = max(0.0, min(100.0, overall_score))

    return RankingResult(
        overall_score=overall_score,
        match_factors=match_factors,
        available_factors=available_factors,
        unavailable_factors=unavailable_factors,
    )
