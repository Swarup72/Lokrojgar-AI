import copy

import pytest

from app.models.application import MatchFactors
from app.ranking.rank import RankingResult, calculate_ranking
from app.recommendation.explanations import explain_ranking_result

ALL_FACTOR_NAMES = ["skill", "location", "availability", "pay", "rating", "relevance"]


def _build_ranking(**factor_scores) -> RankingResult:
    factors = MatchFactors(**factor_scores)
    return calculate_ranking(factors)


def test_all_factors_available():
    ranking = _build_ranking(
        skill=80, location=70, availability=100, pay=60, rating=90, relevance=50
    )

    explanation = explain_ranking_result(ranking)

    assert all(f.available for f in explanation.factors)
    assert explanation.overall_score == ranking.overall_score


def test_some_factors_unavailable():
    ranking = _build_ranking(
        skill=80, location=70, availability=100, pay=None, rating=None, relevance=50
    )

    explanation = explain_ranking_result(ranking)
    by_name = {f.factor: f for f in explanation.factors}

    assert by_name["pay"].available is False
    assert by_name["rating"].available is False
    assert by_name["skill"].available is True
    assert by_name["location"].available is True
    assert by_name["availability"].available is True
    assert by_name["relevance"].available is True


def test_all_factors_unavailable():
    ranking = _build_ranking(
        skill=None, location=None, availability=None, pay=None, rating=None, relevance=None
    )

    explanation = explain_ranking_result(ranking)

    assert explanation.overall_score is None
    assert all(not f.available for f in explanation.factors)
    assert all(f.score is None for f in explanation.factors)
    assert "unavailable" in explanation.summary.lower()


def test_score_of_zero_is_distinguished_from_none():
    ranking = _build_ranking(
        skill=0, location=70, availability=100, pay=None, rating=90, relevance=50
    )

    explanation = explain_ranking_result(ranking)
    by_name = {f.factor: f for f in explanation.factors}

    skill_factor = by_name["skill"]
    pay_factor = by_name["pay"]

    assert skill_factor.available is True
    assert skill_factor.score == 0.0

    assert pay_factor.available is False
    assert pay_factor.score is None
    # The two must never read as the same thing.
    assert skill_factor.available != pay_factor.available


def test_score_of_100():
    ranking = _build_ranking(
        skill=100, location=100, availability=100, pay=100, rating=100, relevance=100
    )

    explanation = explain_ranking_result(ranking)

    assert explanation.overall_score == 100.0
    assert all(f.score == 100.0 for f in explanation.factors)
    assert all(f.available for f in explanation.factors)


@pytest.mark.parametrize("factor_name", ALL_FACTOR_NAMES)
def test_each_factor_is_explained_individually(factor_name):
    scores = {name: (75.0 if name == factor_name else 50.0) for name in ALL_FACTOR_NAMES}
    ranking = _build_ranking(**scores)

    explanation = explain_ranking_result(ranking)
    factor = next(f for f in explanation.factors if f.factor == factor_name)

    assert factor.available is True
    assert factor.score == 75.0
    assert factor.summary  # non-empty, deterministic text


def test_pay_none_explained_as_unavailable_not_incompatible():
    ranking = _build_ranking(
        skill=80, location=70, availability=100, pay=None, rating=90, relevance=50
    )

    pay_factor = next(f for f in explain_ranking_result(ranking).factors if f.factor == "pay")

    assert pay_factor.available is False
    assert pay_factor.score is None
    assert "unit" in pay_factor.summary.lower()
    # Must explicitly disclaim incompatibility, not just avoid the word.
    assert "does not mean the pay is incompatible" in pay_factor.summary.lower()
    assert "mismatch" not in pay_factor.summary.lower()


def test_rating_none_explained_as_unrated_not_poor():
    ranking = _build_ranking(
        skill=80, location=70, availability=100, pay=60, rating=None, relevance=50
    )

    rating_factor = next(
        f for f in explain_ranking_result(ranking).factors if f.factor == "rating"
    )

    assert rating_factor.available is False
    assert rating_factor.score is None
    assert "not received any ratings" in rating_factor.summary.lower()
    # Must explicitly disclaim "poor rating," not just avoid the word.
    assert "not a poor or low rating" in rating_factor.summary.lower()


def test_deterministic_output():
    ranking = _build_ranking(
        skill=80, location=70, availability=100, pay=None, rating=90, relevance=50
    )

    first = explain_ranking_result(ranking)
    second = explain_ranking_result(ranking)

    assert first == second


def test_fixed_factor_ordering_regardless_of_construction_order():
    ranking = _build_ranking(
        relevance=50, rating=90, pay=None, availability=100, location=70, skill=80
    )

    explanation = explain_ranking_result(ranking)

    assert [f.factor for f in explanation.factors] == ALL_FACTOR_NAMES


def test_no_mutation_of_ranking_result():
    ranking = _build_ranking(
        skill=80, location=70, availability=100, pay=None, rating=90, relevance=50
    )
    ranking_before = copy.deepcopy(ranking)

    explain_ranking_result(ranking)

    assert ranking == ranking_before


def test_no_score_recalculation():
    # Deliberately odd, non-"nice" numbers so any transformation (rounding,
    # rescaling, etc.) would be caught by exact equality below.
    ranking = _build_ranking(
        skill=83.33, location=61.11, availability=100, pay=None, rating=47.5, relevance=66.67
    )

    explanation = explain_ranking_result(ranking)
    by_name = {f.factor: f for f in explanation.factors}

    assert by_name["skill"].score == ranking.match_factors.skill
    assert by_name["location"].score == ranking.match_factors.location
    assert by_name["availability"].score == ranking.match_factors.availability
    assert by_name["rating"].score == ranking.match_factors.rating
    assert by_name["relevance"].score == ranking.match_factors.relevance
    assert explanation.overall_score == ranking.overall_score
