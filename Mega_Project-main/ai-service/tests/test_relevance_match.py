import pytest

from app.matching.relevance_match import calculate_relevance_match


def test_all_signals_match():
    result = calculate_relevance_match(
        worker_preferred_categories=["CAT001"],
        job_category_id="CAT001",
        worker_languages=["mr", "hi"],
        job_preferred_languages=["hi"],
        job_original_language="en",
        worker_experience_years=5,
        job_experience_required=2,
    )

    assert result.score == 100.0
    assert result.matched_signals == ["category", "language", "experience"]
    assert result.unmatched_signals == []
    assert result.not_applicable_signals == []


def test_no_preferred_category_is_not_applicable_not_penalized():
    result = calculate_relevance_match(
        worker_preferred_categories=[],
        job_category_id="CAT001",
        worker_languages=["mr", "hi"],
        job_preferred_languages=["hi"],
        job_original_language="en",
        worker_experience_years=5,
        job_experience_required=2,
    )

    assert result.not_applicable_signals == ["category"]
    assert result.score == 100.0  # category excluded from denominator


def test_different_category_is_unmatched():
    result = calculate_relevance_match(
        worker_preferred_categories=["CAT002"],
        job_category_id="CAT001",
        worker_languages=["mr", "hi"],
        job_preferred_languages=["hi"],
        job_original_language="en",
        worker_experience_years=5,
        job_experience_required=2,
    )

    assert "category" in result.unmatched_signals
    assert result.score == pytest.approx(66.66666666666666)


def test_language_falls_back_to_original_language_when_job_has_no_preference():
    result = calculate_relevance_match(
        worker_preferred_categories=["CAT001"],
        job_category_id="CAT001",
        worker_languages=["en"],
        job_preferred_languages=[],
        job_original_language="en",
        worker_experience_years=5,
        job_experience_required=2,
    )

    assert "language" in result.matched_signals


def test_language_mismatch_with_no_job_preference_and_no_shared_original_language():
    result = calculate_relevance_match(
        worker_preferred_categories=["CAT001"],
        job_category_id="CAT001",
        worker_languages=["mr"],
        job_preferred_languages=[],
        job_original_language="en",
        worker_experience_years=5,
        job_experience_required=2,
    )

    assert "language" in result.unmatched_signals


def test_experience_exactly_at_boundary_is_compatible():
    result = calculate_relevance_match(
        worker_preferred_categories=["CAT001"],
        job_category_id="CAT001",
        worker_languages=["mr"],
        job_preferred_languages=["mr"],
        job_original_language="mr",
        worker_experience_years=2,
        job_experience_required=2,
    )

    assert "experience" in result.matched_signals


def test_experience_below_requirement_is_unmatched():
    result = calculate_relevance_match(
        worker_preferred_categories=["CAT001"],
        job_category_id="CAT001",
        worker_languages=["mr"],
        job_preferred_languages=["mr"],
        job_original_language="mr",
        worker_experience_years=1,
        job_experience_required=5,
    )

    assert "experience" in result.unmatched_signals


def test_all_signals_unmatched():
    result = calculate_relevance_match(
        worker_preferred_categories=["CAT002"],
        job_category_id="CAT001",
        worker_languages=["mr"],
        job_preferred_languages=["hi"],
        job_original_language="hi",
        worker_experience_years=0,
        job_experience_required=5,
    )

    assert result.score == 0.0
    assert result.matched_signals == []


def test_not_applicable_category_with_one_matched_one_unmatched():
    result = calculate_relevance_match(
        worker_preferred_categories=[],
        job_category_id="CAT001",
        worker_languages=["mr"],
        job_preferred_languages=["mr"],
        job_original_language="mr",
        worker_experience_years=0,
        job_experience_required=5,
    )

    assert result.not_applicable_signals == ["category"]
    assert "language" in result.matched_signals
    assert "experience" in result.unmatched_signals
    assert result.score == 50.0


def test_custom_signal_weights_change_the_result():
    weights = {"category": 3.0, "language": 1.0, "experience": 1.0}

    result = calculate_relevance_match(
        worker_preferred_categories=["CAT002"],
        job_category_id="CAT001",
        worker_languages=["mr"],
        job_preferred_languages=["mr"],
        job_original_language="mr",
        worker_experience_years=5,
        job_experience_required=2,
        signal_weights=weights,
    )

    # category (unmatched, weight 3) + language (matched, weight 1)
    # + experience (matched, weight 1) => 2 / 5 * 100
    assert result.score == 40.0
