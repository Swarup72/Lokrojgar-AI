import pytest

from app.matching.skill_features import (
    extract_job_skill_ids,
    extract_worker_skill_ids,
    filter_worker_skills_by_worker,
)
from app.matching.skill_match import calculate_skill_match
from app.models.job import Job
from app.models.worker_skill import WorkerSkill


def _build_job(skill_ids: list[str]) -> Job:
    return Job(
        employerId="EMP001",
        location={"type": "Point", "coordinates": [73.8446, 18.5314]},
        payType="daily",
        payAmount=900,
        requiredWorkers=1,
        startDate="2026-10-01T00:00:00Z",
        categoryId="CAT001",
        originalLanguage="en",
        skillIds=skill_ids,
    )


def test_extract_worker_skill_ids():
    worker_skills = [
        WorkerSkill(
            worker_id="W001",
            skill_id="S001",
            proficiency="intermediate",
        ),
        WorkerSkill(
            worker_id="W001",
            skill_id="S002",
            proficiency="intermediate",
        ),
    ]

    result = extract_worker_skill_ids(worker_skills)

    assert result == ["S001", "S002"]


def test_worker_skill_to_skill_match():
    worker_skills = [
        WorkerSkill(
            worker_id="W001",
            skill_id="S001",
            proficiency="expert",
        ),
        WorkerSkill(
            worker_id="W001",
            skill_id="S003",
            proficiency="beginner",
        ),
    ]

    job_skill_ids = [
        "S001",
        "S002",
        "S003",
    ]

    worker_skill_ids = extract_worker_skill_ids(worker_skills)

    result = calculate_skill_match(
        worker_skill_ids,
        job_skill_ids,
    )

    assert result.score == pytest.approx(66.66666666666666)
    assert result.matched_skills == ["S001", "S003"]
    assert result.missing_skills == ["S002"]


def test_extract_job_skill_ids():
    job = _build_job(["S001", "S002", "S003"])

    assert extract_job_skill_ids(job) == ["S001", "S002", "S003"]


def test_extract_job_skill_ids_empty():
    job = _build_job([])

    assert extract_job_skill_ids(job) == []


def test_filter_worker_skills_by_worker_returns_only_matching_rows():
    worker_skills = [
        WorkerSkill(worker_id="W001", skill_id="S001", proficiency="expert"),
        WorkerSkill(worker_id="W001", skill_id="S002", proficiency="beginner"),
        WorkerSkill(worker_id="W002", skill_id="S003", proficiency="intermediate"),
    ]

    result = filter_worker_skills_by_worker(worker_skills, "W001")

    assert [ws.skill_id for ws in result] == ["S001", "S002"]
    assert all(ws.worker_id == "W001" for ws in result)


def test_filter_worker_skills_by_worker_with_no_matches_returns_empty_list():
    worker_skills = [
        WorkerSkill(worker_id="W001", skill_id="S001", proficiency="expert"),
    ]

    result = filter_worker_skills_by_worker(worker_skills, "W999")

    assert result == []


def test_filter_worker_skills_by_worker_with_multiple_workers_in_input():
    worker_skills = [
        WorkerSkill(worker_id="W001", skill_id="S001", proficiency="expert"),
        WorkerSkill(worker_id="W002", skill_id="S002", proficiency="expert"),
        WorkerSkill(worker_id="W001", skill_id="S003", proficiency="beginner"),
        WorkerSkill(worker_id="W003", skill_id="S004", proficiency="intermediate"),
    ]

    w001_skills = filter_worker_skills_by_worker(worker_skills, "W001")
    w002_skills = filter_worker_skills_by_worker(worker_skills, "W002")
    w003_skills = filter_worker_skills_by_worker(worker_skills, "W003")

    assert [ws.skill_id for ws in w001_skills] == ["S001", "S003"]
    assert [ws.skill_id for ws in w002_skills] == ["S002"]
    assert [ws.skill_id for ws in w003_skills] == ["S004"]


def test_filter_then_extract_handles_duplicate_skill_ids_like_existing_matcher():
    # A worker with a duplicate skill claim (e.g. two WorkerSkill rows
    # pointing at the same Skill) should flow into calculate_skill_match
    # exactly like the existing duplicate-handling tests in
    # test_skill_match.py - the matcher already dedupes via set(), so
    # filtering/extraction upstream must not need to do that itself.
    worker_skills = [
        WorkerSkill(worker_id="W001", skill_id="S001", proficiency="expert"),
        WorkerSkill(worker_id="W001", skill_id="S001", proficiency="beginner"),
        WorkerSkill(worker_id="W001", skill_id="S002", proficiency="intermediate"),
        WorkerSkill(worker_id="W002", skill_id="S999", proficiency="expert"),
    ]
    job = _build_job(["S001", "S002"])

    filtered = filter_worker_skills_by_worker(worker_skills, "W001")
    worker_skill_ids = extract_worker_skill_ids(filtered)
    job_skill_ids = extract_job_skill_ids(job)

    assert worker_skill_ids == ["S001", "S001", "S002"]

    result = calculate_skill_match(worker_skill_ids, job_skill_ids)

    assert result.score == 100.0
    assert result.matched_skills == ["S001", "S002"]
    assert result.missing_skills == []