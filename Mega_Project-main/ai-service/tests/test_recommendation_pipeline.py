import copy

import pytest

from app.matching.availability_features import extract_job_status, extract_worker_availability
from app.matching.availability_match import calculate_availability_match
from app.matching.location_features import (
    extract_job_location,
    extract_worker_location,
    extract_worker_preferred_radius_km,
)
from app.matching.location_match import calculate_location_match
from app.matching.pay_features import (
    extract_job_offered_pay,
    extract_job_pay_type,
    extract_worker_expected_pay,
)
from app.matching.pay_match import calculate_pay_match
from app.matching.rating_features import extract_worker_rating_avg
from app.matching.rating_match import calculate_rating_match
from app.matching.relevance_features import (
    extract_job_category_id,
    extract_job_experience_required,
    extract_job_original_language,
    extract_job_preferred_languages,
    extract_worker_experience_years,
    extract_worker_languages,
    extract_worker_preferred_categories,
)
from app.matching.relevance_match import calculate_relevance_match
from app.matching.skill_features import (
    extract_job_skill_ids,
    extract_worker_skill_ids,
    filter_worker_skills_by_worker,
)
from app.matching.skill_match import calculate_skill_match
from app.models.job import Job
from app.models.worker import WorkerProfile
from app.models.worker_skill import WorkerSkill
from app.ranking.config import RankingWeights
from app.ranking.factors import build_match_factors
from app.ranking.rank import RankingResult, calculate_ranking
from app.recommendation.pipeline import score_worker_job_pair


def _build_worker(
    worker_id="WORKER001",
    expected_pay=None,
    rating_avg=0,
    preferred_categories=None,
    languages=None,
    experience_years=0,
    availability="available",
    preferred_radius_km=20,
    coordinates=None,
) -> WorkerProfile:
    return WorkerProfile(
        worker_id=worker_id,
        userId="USER001",
        fullName="Ramesh Patil",
        location={"type": "Point", "coordinates": coordinates or [73.8567, 18.5204]},
        availability=availability,
        expectedPay=expected_pay,
        ratingAvg=rating_avg,
        languages=languages or ["mr", "hi"],
        preferredJobCategories=preferred_categories or [],
        preferredWorkRadiusKm=preferred_radius_km,
        experienceYears=experience_years,
    )


def _build_job(
    job_id="JOB001",
    skill_ids=None,
    category_id="CAT001",
    preferred_languages=None,
    original_language="en",
    experience_required=0,
    pay_amount=900,
    pay_type="daily",
    status="open",
    coordinates=None,
) -> Job:
    return Job(
        job_id=job_id,
        employerId="EMP001",
        location={"type": "Point", "coordinates": coordinates or [73.8446, 18.5314]},
        payType=pay_type,
        payAmount=pay_amount,
        requiredWorkers=1,
        startDate="2026-10-01T00:00:00Z",
        categoryId=category_id,
        originalLanguage=original_language,
        skillIds=skill_ids or [],
        preferredLanguages=preferred_languages or [],
        experienceRequired=experience_required,
        status=status,
    )


def _build_worker_skill(worker_id, skill_id, proficiency="expert") -> WorkerSkill:
    return WorkerSkill(worker_id=worker_id, skill_id=skill_id, proficiency=proficiency)


def _recompute_ranking_independently(worker, worker_skills, job, weights=None) -> RankingResult:
    """
    Recomputes the full pipeline "by hand," calling each matcher/adapter
    directly rather than through score_worker_job_pair. Used to prove the
    pipeline produces exactly the same result as the underlying components
    - i.e. that it orchestrates rather than reimplements them.
    """

    filtered = filter_worker_skills_by_worker(worker_skills, worker.worker_id)
    skill_result = calculate_skill_match(
        extract_worker_skill_ids(filtered), extract_job_skill_ids(job)
    )
    location_result = calculate_location_match(
        extract_worker_location(worker),
        extract_job_location(job),
        extract_worker_preferred_radius_km(worker),
    )
    availability_result = calculate_availability_match(
        extract_worker_availability(worker), extract_job_status(job)
    )
    pay_result = calculate_pay_match(
        extract_worker_expected_pay(worker),
        extract_job_offered_pay(job),
        extract_job_pay_type(job),
    )
    rating_result = calculate_rating_match(extract_worker_rating_avg(worker))
    relevance_result = calculate_relevance_match(
        extract_worker_preferred_categories(worker),
        extract_job_category_id(job),
        extract_worker_languages(worker),
        extract_job_preferred_languages(job),
        extract_job_original_language(job),
        extract_worker_experience_years(worker),
        extract_job_experience_required(job),
    )
    match_factors = build_match_factors(
        skill_result, location_result, availability_result,
        pay_result, rating_result, relevance_result,
    )
    return calculate_ranking(match_factors, weights)


def test_complete_pair_produces_ranking_result():
    worker = _build_worker(rating_avg=4.5, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001"], experience_required=2)

    result = score_worker_job_pair(worker, worker_skills, job)

    assert isinstance(result, RankingResult)
    assert result.overall_score is not None


def test_all_six_match_factors_populated_correctly():
    worker = _build_worker(rating_avg=4.5, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001"], experience_required=2)

    result = score_worker_job_pair(worker, worker_skills, job)
    factors = result.match_factors

    # Cross-check each factor against an independently-run matcher call,
    # proving the pipeline passes through real matcher output rather than
    # computing something different.
    filtered = filter_worker_skills_by_worker(worker_skills, worker.worker_id)
    assert factors.skill == calculate_skill_match(
        extract_worker_skill_ids(filtered), extract_job_skill_ids(job)
    ).score
    assert factors.location == calculate_location_match(
        extract_worker_location(worker),
        extract_job_location(job),
        extract_worker_preferred_radius_km(worker),
    ).score
    assert factors.availability == calculate_availability_match(
        extract_worker_availability(worker), extract_job_status(job)
    ).score
    assert factors.rating == calculate_rating_match(extract_worker_rating_avg(worker)).score
    assert factors.relevance == calculate_relevance_match(
        extract_worker_preferred_categories(worker),
        extract_job_category_id(job),
        extract_worker_languages(worker),
        extract_job_preferred_languages(job),
        extract_job_original_language(job),
        extract_worker_experience_years(worker),
        extract_job_experience_required(job),
    ).score


def test_pay_remains_none_not_zero():
    worker = _build_worker(expected_pay=800)
    job = _build_job(pay_amount=900, pay_type="daily")

    result = score_worker_job_pair(worker, [], job)

    assert result.match_factors.pay is None
    assert "pay" in result.unavailable_factors


def test_rating_none_preserved_for_unrated_worker():
    worker = _build_worker(rating_avg=0)  # cold start default
    job = _build_job()

    result = score_worker_job_pair(worker, [], job)

    assert result.match_factors.rating is None
    assert "rating" in result.unavailable_factors


def test_worker_skills_correctly_filtered_by_worker_id():
    job = _build_job(skill_ids=["S001", "S002"])
    worker = _build_worker(worker_id="WORKER001")

    # WORKER001 only has S001; S002 belongs to an unrelated worker and
    # must NOT leak into WORKER001's skill match.
    worker_skills = [
        _build_worker_skill("WORKER001", "S001"),
        _build_worker_skill("WORKER002", "S002"),
    ]

    result = score_worker_job_pair(worker, worker_skills, job)

    # If filtering were broken (both rows used), this would be 100.0.
    assert result.match_factors.skill == 50.0


def test_job_skill_ids_passed_through_adapter():
    worker = _build_worker()
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001", "S002", "S003"])

    result = score_worker_job_pair(worker, worker_skills, job)

    # 1 of 3 required skills matched => score is derived from job.skill_ids
    assert result.match_factors.skill == pytest.approx(33.33333333333333)


def test_ranking_score_equals_existing_ranking_implementation():
    worker = _build_worker(rating_avg=3.5, experience_years=4, preferred_categories=["CAT001"])
    worker_skills = [
        _build_worker_skill("WORKER001", "S001"),
        _build_worker_skill("WORKER001", "S002"),
    ]
    job = _build_job(skill_ids=["S001", "S002"], category_id="CAT001", experience_required=2)
    weights = RankingWeights(skill=2, location=1, availability=1, pay=1, rating=1, relevance=1)

    pipeline_result = score_worker_job_pair(worker, worker_skills, job, weights)
    expected_result = _recompute_ranking_independently(worker, worker_skills, job, weights)

    assert pipeline_result == expected_result


def test_custom_ranking_weights_are_respected():
    worker = _build_worker(rating_avg=4.5, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001", "S002"], experience_required=2)

    default_result = score_worker_job_pair(worker, worker_skills, job)

    skill_heavy_weights = RankingWeights(
        skill=10, location=1, availability=1, pay=1, rating=1, relevance=1
    )
    skill_heavy_result = score_worker_job_pair(worker, worker_skills, job, skill_heavy_weights)

    # Skill is only a partial match (50%) here, so weighting it heavily
    # must pull the overall score down compared to equal weighting.
    assert skill_heavy_result.overall_score < default_result.overall_score


def test_worker_with_no_skills_still_produces_valid_result():
    worker = _build_worker()
    job = _build_job(skill_ids=["S001"])

    result = score_worker_job_pair(worker, [], job)

    assert result.match_factors.skill == 0.0
    assert result.overall_score is not None


def test_job_with_no_required_skills_still_produces_valid_result():
    worker = _build_worker()
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=[])

    result = score_worker_job_pair(worker, worker_skills, job)

    assert result.match_factors.skill == 0.0
    assert "skill" in result.available_factors
    assert result.overall_score is not None


def test_same_input_produces_identical_result():
    worker = _build_worker(rating_avg=4.5, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001"], experience_required=2)

    first = score_worker_job_pair(worker, worker_skills, job)
    second = score_worker_job_pair(worker, worker_skills, job)

    assert first == second


def test_pipeline_does_not_mutate_inputs():
    worker = _build_worker(rating_avg=4.5, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001"], experience_required=2)

    worker_before = copy.deepcopy(worker)
    worker_skills_before = copy.deepcopy(worker_skills)
    job_before = copy.deepcopy(job)

    score_worker_job_pair(worker, worker_skills, job)

    assert worker == worker_before
    assert worker_skills == worker_skills_before
    assert job == job_before


def test_pipeline_does_not_swallow_errors_from_bad_input():
    # A validly-constructed WorkerProfile/Job/WorkerSkill can never contain
    # out-of-domain data (Pydantic already enforces that at construction),
    # so the only way to observe "invalid data raises normally" at the
    # pipeline boundary is to pass something structurally wrong. This
    # confirms there is no broad try/except hiding failures.
    job = _build_job()

    with pytest.raises(AttributeError):
        score_worker_job_pair(None, [], job)
