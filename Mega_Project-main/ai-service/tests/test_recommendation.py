import copy

import pytest

from app.models.job import Job
from app.models.worker import WorkerProfile
from app.models.worker_skill import WorkerSkill
from app.ranking.config import RankingWeights
from app.recommendation.pipeline import score_worker_job_pair
from app.recommendation.recommend import recommend_jobs_for_worker, recommend_workers_for_job


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


# A weight configuration engineered so that, for a worker/job pair where
# pay and rating are the only unavailable factors, the four always-available
# factors (skill/location/availability/relevance) are given zero weight -
# leaving zero usable weight overall, so overall_score comes out None. This
# is the only realistic way to reach a None overall_score with real data.
_ZERO_USABLE_WEIGHT = RankingWeights(
    skill=0, location=0, availability=0, relevance=0, pay=1, rating=1
)


# ============================= Worker -> Jobs =============================


def test_worker_to_jobs_single_candidate():
    worker = _build_worker(rating_avg=4, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001"], experience_required=2)

    result = recommend_jobs_for_worker(worker, worker_skills, [job])

    assert len(result.matches) == 1
    assert result.matches[0].job_id == "JOB001"


def test_worker_to_jobs_multiple_candidates():
    worker = _build_worker(rating_avg=4, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    jobs = [
        _build_job("J1", skill_ids=["S001"]),
        _build_job("J2", skill_ids=["S999"]),
        _build_job("J3", skill_ids=["S001"]),
    ]

    result = recommend_jobs_for_worker(worker, worker_skills, jobs, top_k=10)

    assert {m.job_id for m in result.matches} == {"J1", "J2", "J3"}


def test_worker_to_jobs_correct_score_ordering():
    worker = _build_worker(rating_avg=4, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [
        _build_worker_skill("WORKER001", "S001"),
        _build_worker_skill("WORKER001", "S002"),
        _build_worker_skill("WORKER001", "S003"),
    ]
    full_match = _build_job("FULL", skill_ids=["S001"])
    partial_match = _build_job("PARTIAL", skill_ids=["S001", "S002", "S003", "S004"])
    no_match = _build_job("NONE", skill_ids=["S999"])

    result = recommend_jobs_for_worker(
        worker, worker_skills, [no_match, partial_match, full_match], top_k=10
    )

    job_ids_in_order = [m.job_id for m in result.matches]
    assert job_ids_in_order.index("FULL") < job_ids_in_order.index("PARTIAL")
    assert job_ids_in_order.index("PARTIAL") < job_ids_in_order.index("NONE")
    scores = [m.ranking.overall_score for m in result.matches]
    assert scores == sorted(scores, reverse=True)


def test_worker_to_jobs_correct_top_k():
    worker = _build_worker()
    worker_skills = []
    jobs = [_build_job(f"J{i}", skill_ids=[]) for i in range(5)]

    result = recommend_jobs_for_worker(worker, worker_skills, jobs, top_k=2)

    assert len(result.matches) == 2


def test_worker_to_jobs_top_k_larger_than_candidate_count():
    worker = _build_worker()
    jobs = [_build_job("J1"), _build_job("J2")]

    result = recommend_jobs_for_worker(worker, [], jobs, top_k=10)

    assert len(result.matches) == 2


def test_worker_to_jobs_empty_candidate_list():
    worker = _build_worker()

    result = recommend_jobs_for_worker(worker, [], [])

    assert result.matches == []


def test_worker_to_jobs_excludes_non_open_jobs():
    worker = _build_worker()
    jobs = [
        _build_job("OPEN", status="open"),
        _build_job("ASSIGNED", status="assigned"),
        _build_job("COMPLETED", status="completed"),
        _build_job("CANCELLED", status="cancelled"),
    ]

    result = recommend_jobs_for_worker(worker, [], jobs, top_k=10)

    assert [m.job_id for m in result.matches] == ["OPEN"]


def test_worker_to_jobs_excludes_none_overall_score():
    worker = _build_worker(rating_avg=0)  # cold start -> rating is None
    job = _build_job()  # pay is always None in v1

    result = recommend_jobs_for_worker(
        worker, [], [job], weights=_ZERO_USABLE_WEIGHT, top_k=10
    )

    assert result.matches == []


def test_worker_to_jobs_deterministic_tie_break_by_job_id():
    worker = _build_worker()
    identical_jobs = [
        _build_job("Z_JOB", skill_ids=[]),
        _build_job("A_JOB", skill_ids=[]),
        _build_job("M_JOB", skill_ids=[]),
    ]

    result = recommend_jobs_for_worker(worker, [], identical_jobs, top_k=10)

    scores = {m.ranking.overall_score for m in result.matches}
    assert len(scores) == 1  # confirms this is a genuine tie
    assert [m.job_id for m in result.matches] == ["A_JOB", "M_JOB", "Z_JOB"]


def test_worker_to_jobs_ranking_weights_passed_through():
    worker = _build_worker(rating_avg=4, experience_years=5)
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001", "S002"])

    default_result = recommend_jobs_for_worker(worker, worker_skills, [job])
    skill_heavy = RankingWeights(skill=10, location=1, availability=1, pay=1, rating=1, relevance=1)
    weighted_result = recommend_jobs_for_worker(worker, worker_skills, [job], weights=skill_heavy)

    assert (
        weighted_result.matches[0].ranking.overall_score
        != default_result.matches[0].ranking.overall_score
    )


def test_worker_to_jobs_match_factors_preserved():
    worker = _build_worker(rating_avg=4.5, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001"], category_id="CAT001", experience_required=2)

    result = recommend_jobs_for_worker(worker, worker_skills, [job])

    factors = result.matches[0].ranking.match_factors
    assert factors.skill == 100.0
    assert factors.rating == 87.5
    assert factors.pay is None  # v1 schema limitation, must not become 0


def test_worker_to_jobs_direction_correct():
    worker = _build_worker()
    job = _build_job()

    result = recommend_jobs_for_worker(worker, [], [job])

    assert result.direction == "worker_to_jobs"


def test_worker_to_jobs_anchor_id_correct():
    worker = _build_worker(worker_id="WORKER777")
    job = _build_job()

    result = recommend_jobs_for_worker(worker, [], [job])

    assert result.anchor_id == "WORKER777"


def test_worker_to_jobs_repeated_identical_input_gives_identical_output():
    worker = _build_worker(rating_avg=4, experience_years=5)
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    jobs = [_build_job("J1", skill_ids=["S001"]), _build_job("J2", skill_ids=["S999"])]

    first = recommend_jobs_for_worker(worker, worker_skills, jobs)
    second = recommend_jobs_for_worker(worker, worker_skills, jobs)

    assert first == second


# ============================= Job -> Workers =============================


def test_job_to_workers_single_candidate():
    job = _build_job(skill_ids=["S001"])
    worker = _build_worker("WORKER001")
    worker_skills = [_build_worker_skill("WORKER001", "S001")]

    result = recommend_workers_for_job(job, [worker], worker_skills)

    assert len(result.matches) == 1
    assert result.matches[0].worker_id == "WORKER001"


def test_job_to_workers_multiple_candidates():
    job = _build_job(skill_ids=["S001"])
    workers = [_build_worker("W1"), _build_worker("W2"), _build_worker("W3")]
    worker_skills = [_build_worker_skill("W1", "S001")]

    result = recommend_workers_for_job(job, workers, worker_skills, top_k=10)

    assert {m.worker_id for m in result.matches} == {"W1", "W2", "W3"}


def test_job_to_workers_correct_score_ordering():
    job = _build_job(skill_ids=["S001", "S002", "S003"])
    full_match = _build_worker("FULL")
    partial_match = _build_worker("PARTIAL")
    no_match = _build_worker("NONE")
    worker_skills = [
        _build_worker_skill("FULL", "S001"),
        _build_worker_skill("FULL", "S002"),
        _build_worker_skill("FULL", "S003"),
        _build_worker_skill("PARTIAL", "S001"),
        _build_worker_skill("NONE", "S999"),
    ]

    result = recommend_workers_for_job(
        job, [no_match, partial_match, full_match], worker_skills, top_k=10
    )

    worker_ids_in_order = [m.worker_id for m in result.matches]
    assert worker_ids_in_order.index("FULL") < worker_ids_in_order.index("PARTIAL")
    assert worker_ids_in_order.index("PARTIAL") < worker_ids_in_order.index("NONE")


def test_job_to_workers_correct_top_k():
    job = _build_job()
    workers = [_build_worker(f"W{i}") for i in range(5)]

    result = recommend_workers_for_job(job, workers, [], top_k=2)

    assert len(result.matches) == 2


def test_job_to_workers_top_k_larger_than_candidate_count():
    job = _build_job()
    workers = [_build_worker("W1"), _build_worker("W2")]

    result = recommend_workers_for_job(job, workers, [], top_k=10)

    assert len(result.matches) == 2


def test_job_to_workers_empty_worker_list():
    job = _build_job()

    result = recommend_workers_for_job(job, [], [])

    assert result.matches == []


def test_job_to_workers_availability_is_scoring_factor_not_hard_filter():
    job = _build_job(status="open")
    unavailable_worker = _build_worker("W1", availability="unavailable")

    result = recommend_workers_for_job(job, [unavailable_worker], [], top_k=10)

    # Not excluded outright - it is scored (and will rank poorly via
    # Availability Matching), which is a very different thing from being
    # filtered out before scoring.
    assert len(result.matches) == 1
    assert result.matches[0].ranking.match_factors.availability == 0.0


def test_job_to_workers_excludes_none_overall_score():
    job = _build_job()
    worker = _build_worker(rating_avg=0)

    result = recommend_workers_for_job(
        job, [worker], [], weights=_ZERO_USABLE_WEIGHT, top_k=10
    )

    assert result.matches == []


def test_job_to_workers_deterministic_tie_break_by_worker_id():
    job = _build_job(skill_ids=[])
    identical_workers = [
        _build_worker("Z_WORKER"),
        _build_worker("A_WORKER"),
        _build_worker("M_WORKER"),
    ]

    result = recommend_workers_for_job(job, identical_workers, [], top_k=10)

    scores = {m.ranking.overall_score for m in result.matches}
    assert len(scores) == 1  # confirms this is a genuine tie
    assert [m.worker_id for m in result.matches] == ["A_WORKER", "M_WORKER", "Z_WORKER"]


def test_job_to_workers_ranking_weights_passed_through():
    job = _build_job(skill_ids=["S001", "S002"])
    worker = _build_worker("W1")
    worker_skills = [_build_worker_skill("W1", "S001")]

    default_result = recommend_workers_for_job(job, [worker], worker_skills)
    skill_heavy = RankingWeights(skill=10, location=1, availability=1, pay=1, rating=1, relevance=1)
    weighted_result = recommend_workers_for_job(
        job, [worker], worker_skills, weights=skill_heavy
    )

    assert (
        weighted_result.matches[0].ranking.overall_score
        != default_result.matches[0].ranking.overall_score
    )


def test_job_to_workers_match_factors_preserved():
    job = _build_job(skill_ids=["S001"], category_id="CAT001", experience_required=2)
    worker = _build_worker(
        "W1", rating_avg=4.5, experience_years=5, preferred_categories=["CAT001"]
    )
    worker_skills = [_build_worker_skill("W1", "S001")]

    result = recommend_workers_for_job(job, [worker], worker_skills)

    factors = result.matches[0].ranking.match_factors
    assert factors.skill == 100.0
    assert factors.rating == 87.5
    assert factors.pay is None


def test_job_to_workers_direction_correct():
    job = _build_job()
    worker = _build_worker()

    result = recommend_workers_for_job(job, [worker], [])

    assert result.direction == "job_to_workers"


def test_job_to_workers_anchor_id_correct():
    job = _build_job(job_id="JOB999")
    worker = _build_worker()

    result = recommend_workers_for_job(job, [worker], [])

    assert result.anchor_id == "JOB999"


def test_job_to_workers_worker_skill_rows_correctly_selected():
    job = _build_job(skill_ids=["S001", "S002"])
    worker_a = _build_worker("A")
    worker_b = _build_worker("B")
    # Bulk list containing rows for BOTH workers - each candidate must only
    # be scored against their own rows.
    worker_skills = [
        _build_worker_skill("A", "S001"),
        _build_worker_skill("B", "S002"),
    ]

    result = recommend_workers_for_job(job, [worker_a, worker_b], worker_skills, top_k=10)

    by_id = {m.worker_id: m for m in result.matches}
    assert by_id["A"].ranking.match_factors.skill == 50.0
    assert by_id["B"].ranking.match_factors.skill == 50.0


def test_job_to_workers_repeated_identical_input_gives_identical_output():
    job = _build_job(skill_ids=["S001"])
    workers = [_build_worker("W1"), _build_worker("W2")]
    worker_skills = [_build_worker_skill("W1", "S001")]

    first = recommend_workers_for_job(job, workers, worker_skills)
    second = recommend_workers_for_job(job, workers, worker_skills)

    assert first == second


# ============================== Validation =================================


def test_top_k_zero_raises():
    worker = _build_worker()
    job = _build_job()

    with pytest.raises(ValueError):
        recommend_jobs_for_worker(worker, [], [job], top_k=0)

    with pytest.raises(ValueError):
        recommend_workers_for_job(job, [worker], [], top_k=0)


def test_top_k_negative_raises():
    worker = _build_worker()
    job = _build_job()

    with pytest.raises(ValueError):
        recommend_jobs_for_worker(worker, [], [job], top_k=-1)

    with pytest.raises(ValueError):
        recommend_workers_for_job(job, [worker], [], top_k=-5)


# =============================== Integrity ==================================


def test_no_mutation_of_worker_objects():
    worker = _build_worker(rating_avg=4, experience_years=5)
    worker_before = copy.deepcopy(worker)
    jobs = [_build_job("J1", skill_ids=["S001"])]

    recommend_jobs_for_worker(worker, [], jobs)

    assert worker == worker_before


def test_no_mutation_of_job_objects():
    job = _build_job(skill_ids=["S001"])
    job_before = copy.deepcopy(job)
    worker = _build_worker()

    recommend_jobs_for_worker(worker, [], [job])
    recommend_workers_for_job(job, [worker], [])

    assert job == job_before


def test_no_mutation_of_worker_skill_list():
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    worker_skills_before = copy.deepcopy(worker_skills)
    worker = _build_worker("WORKER001")
    job = _build_job(skill_ids=["S001"])

    recommend_jobs_for_worker(worker, worker_skills, [job])
    recommend_workers_for_job(job, [worker], worker_skills)

    assert worker_skills == worker_skills_before


def test_existing_pipeline_result_unchanged():
    worker = _build_worker(rating_avg=4, experience_years=5, preferred_categories=["CAT001"])
    worker_skills = [_build_worker_skill("WORKER001", "S001")]
    job = _build_job(skill_ids=["S001"], category_id="CAT001", experience_required=2)

    direct_ranking = score_worker_job_pair(worker, worker_skills, job)
    recommendation = recommend_jobs_for_worker(worker, worker_skills, [job])

    assert recommendation.matches[0].ranking == direct_ranking
