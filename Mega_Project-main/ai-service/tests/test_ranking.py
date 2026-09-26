import pytest
from pydantic import ValidationError

from app.models.application import MatchFactors
from app.ranking.config import RankingWeights
from app.ranking.rank import calculate_ranking


def test_all_factors_available():
    factors = MatchFactors(
        skill=80, location=70, availability=100, pay=60, rating=90, relevance=50
    )

    result = calculate_ranking(factors)

    expected = (80 + 70 + 100 + 60 + 90 + 50) / 6
    assert result.overall_score == pytest.approx(expected)
    assert result.available_factors == [
        "skill",
        "location",
        "availability",
        "pay",
        "rating",
        "relevance",
    ]
    assert result.unavailable_factors == []


def test_missing_pay_excluded_not_zeroed():
    factors = MatchFactors(
        skill=80, location=70, availability=100, pay=None, rating=90, relevance=60
    )

    result = calculate_ranking(factors)

    expected = (80 + 70 + 100 + 90 + 60) / 5
    assert result.overall_score == pytest.approx(expected)
    assert "pay" in result.unavailable_factors
    assert "pay" not in result.available_factors

    # Sanity check: if pay had been zeroed instead of excluded, the score
    # would be lower than this.
    zeroed_average = (80 + 70 + 100 + 0 + 90 + 60) / 6
    assert result.overall_score > zeroed_average


def test_missing_rating_excluded_not_zeroed():
    factors = MatchFactors(
        skill=80, location=70, availability=100, pay=60, rating=None, relevance=60
    )

    result = calculate_ranking(factors)

    expected = (80 + 70 + 100 + 60 + 60) / 5
    assert result.overall_score == pytest.approx(expected)
    assert "rating" in result.unavailable_factors
    assert "rating" not in result.available_factors


def test_zero_score_is_a_real_available_factor():
    factors = MatchFactors(
        skill=0, location=70, availability=100, pay=60, rating=90, relevance=60
    )

    result = calculate_ranking(factors)

    assert "skill" in result.available_factors
    assert "skill" not in result.unavailable_factors
    expected = (0 + 70 + 100 + 60 + 90 + 60) / 6
    assert result.overall_score == pytest.approx(expected)


def test_all_scores_100_yields_100():
    factors = MatchFactors(
        skill=100, location=100, availability=100, pay=100, rating=100, relevance=100
    )

    result = calculate_ranking(factors)

    assert result.overall_score == 100.0


def test_custom_weights_change_the_result():
    factors = MatchFactors(
        skill=100, location=0, availability=100, pay=100, rating=100, relevance=100
    )

    equal_weights_result = calculate_ranking(factors)

    location_heavy_weights = RankingWeights(
        skill=1, location=10, availability=1, pay=1, rating=1, relevance=1
    )
    location_heavy_result = calculate_ranking(factors, location_heavy_weights)

    # Location scores 0 and now dominates the weighting, so the overall
    # score must drop compared to equal weighting.
    assert location_heavy_result.overall_score < equal_weights_result.overall_score


def test_ranking_is_deterministic():
    factors = MatchFactors(
        skill=80, location=70, availability=100, pay=None, rating=90, relevance=60
    )
    weights = RankingWeights(skill=2, location=1, availability=1, pay=1, rating=1, relevance=1)

    first = calculate_ranking(factors, weights)
    second = calculate_ranking(factors, weights)

    assert first == second


def test_negative_weight_is_rejected():
    with pytest.raises(ValidationError):
        RankingWeights(skill=-1)


def test_all_zero_weights_rejected():
    with pytest.raises(ValidationError):
        RankingWeights(
            skill=0, location=0, availability=0, pay=0, rating=0, relevance=0
        )


def test_score_bounded_between_0_and_100():
    low_factors = MatchFactors(
        skill=0, location=0, availability=0, pay=0, rating=0, relevance=0
    )
    high_factors = MatchFactors(
        skill=100, location=100, availability=100, pay=100, rating=100, relevance=100
    )
    skewed_weights = RankingWeights(
        skill=5, location=1, availability=1, pay=1, rating=1, relevance=1
    )

    low_result = calculate_ranking(low_factors, skewed_weights)
    high_result = calculate_ranking(high_factors, skewed_weights)

    assert 0.0 <= low_result.overall_score <= 100.0
    assert 0.0 <= high_result.overall_score <= 100.0


def test_all_factors_unavailable_yields_none_score():
    factors = MatchFactors(
        skill=None, location=None, availability=None, pay=None, rating=None, relevance=None
    )

    result = calculate_ranking(factors)

    assert result.overall_score is None
    assert result.available_factors == []
    assert result.unavailable_factors == [
        "skill",
        "location",
        "availability",
        "pay",
        "rating",
        "relevance",
    ]


def test_mixed_zero_and_none_factors_are_distinguished():
    factors = MatchFactors(
        skill=0, location=None, availability=100, pay=None, rating=50, relevance=None
    )

    result = calculate_ranking(factors)

    assert "skill" in result.available_factors  # 0 is real, not missing
    assert "location" in result.unavailable_factors
    assert "pay" in result.unavailable_factors
    assert "relevance" in result.unavailable_factors

    expected = (0 + 100 + 50) / 3
    assert result.overall_score == pytest.approx(expected)


def test_available_factors_with_zero_total_weight_yields_none():
    # Only skill and availability are available, but their weights are
    # both zero - there is no usable weight to average with, even though
    # the RankingWeights object as a whole is not "all zero".
    factors = MatchFactors(
        skill=80, location=None, availability=70, pay=None, rating=None, relevance=None
    )
    weights = RankingWeights(
        skill=0, location=1, availability=0, pay=1, rating=1, relevance=1
    )

    result = calculate_ranking(factors, weights)

    assert result.overall_score is None
