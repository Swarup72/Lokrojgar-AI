from app.matching.availability_match import AvailabilityMatchResult
from app.matching.location_match import LocationMatchResult
from app.matching.pay_match import PayMatchResult
from app.matching.rating_match import RatingMatchResult
from app.matching.relevance_match import RelevanceMatchResult
from app.matching.skill_match import SkillMatchResult
from app.models.application import MatchFactors


def build_match_factors(
    skill_result: SkillMatchResult,
    location_result: LocationMatchResult,
    availability_result: AvailabilityMatchResult,
    pay_result: PayMatchResult,
    rating_result: RatingMatchResult,
    relevance_result: RelevanceMatchResult,
) -> MatchFactors:
    """
    Assemble the six already-computed matcher results into one
    MatchFactors container.

    This does not recalculate anything - it only reads `.score` off each
    result. All six matchers already return 0-100 scores (or None when a
    factor couldn't be computed), so no conversion is needed here either.
    """

    return MatchFactors(
        skill=skill_result.score,
        location=location_result.score,
        availability=availability_result.score,
        pay=pay_result.score,
        rating=rating_result.score,
        relevance=relevance_result.score,
    )
