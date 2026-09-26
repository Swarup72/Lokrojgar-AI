from app.matching.availability_match import AvailabilityMatchResult
from app.matching.location_match import LocationMatchResult
from app.matching.pay_match import PayMatchResult
from app.matching.rating_match import RatingMatchResult
from app.matching.relevance_match import RelevanceMatchResult
from app.matching.skill_match import SkillMatchResult
from app.ranking.factors import build_match_factors


def test_build_match_factors_transfers_scores_as_is():
    skill_result = SkillMatchResult(score=80.0, matched_skills=["S001"], missing_skills=[])
    location_result = LocationMatchResult(score=70.0, distance_km=5.0, within_radius=True)
    availability_result = AvailabilityMatchResult(
        score=100.0, compatible=True, reason="ok"
    )
    pay_result = PayMatchResult(
        score=None,
        comparable=False,
        worker_expected_pay=800,
        job_offered_pay=900,
        job_pay_type="daily",
        reason="not comparable",
    )
    rating_result = RatingMatchResult(
        score=None, rating_available=False, rating_avg=0, reason="unrated"
    )
    relevance_result = RelevanceMatchResult(
        score=60.0,
        matched_signals=["language"],
        unmatched_signals=["category"],
        not_applicable_signals=[],
        reason="matched: language; unmatched: category",
    )

    match_factors = build_match_factors(
        skill_result,
        location_result,
        availability_result,
        pay_result,
        rating_result,
        relevance_result,
    )

    assert match_factors.skill == 80.0
    assert match_factors.location == 70.0
    assert match_factors.availability == 100.0
    assert match_factors.pay is None
    assert match_factors.rating is None
    assert match_factors.relevance == 60.0
