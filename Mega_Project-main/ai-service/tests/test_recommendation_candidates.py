import copy

from app.models.job import Job
from app.recommendation.candidates import filter_open_jobs


def _build_job(job_id="JOB001", status="open", required_workers=1, filled_workers=0) -> Job:
    return Job(
        job_id=job_id,
        employerId="EMP001",
        location={"type": "Point", "coordinates": [73.8446, 18.5314]},
        payType="daily",
        payAmount=900,
        requiredWorkers=required_workers,
        filledWorkers=filled_workers,
        startDate="2026-10-01T00:00:00Z",
        categoryId="CAT001",
        originalLanguage="en",
        status=status,
    )


def test_all_open_jobs_are_retained():
    jobs = [_build_job("J1", "open"), _build_job("J2", "open"), _build_job("J3", "open")]

    result = filter_open_jobs(jobs)

    assert result == jobs


def test_assigned_jobs_are_removed():
    jobs = [_build_job("J1", "open"), _build_job("J2", "assigned")]

    result = filter_open_jobs(jobs)

    assert [job.job_id for job in result] == ["J1"]


def test_completed_jobs_are_removed():
    jobs = [_build_job("J1", "open"), _build_job("J2", "completed")]

    result = filter_open_jobs(jobs)

    assert [job.job_id for job in result] == ["J1"]


def test_cancelled_jobs_are_removed():
    jobs = [_build_job("J1", "open"), _build_job("J2", "cancelled")]

    result = filter_open_jobs(jobs)

    assert [job.job_id for job in result] == ["J1"]


def test_mixed_statuses():
    jobs = [
        _build_job("J1", "open"),
        _build_job("J2", "assigned"),
        _build_job("J3", "completed"),
        _build_job("J4", "open"),
        _build_job("J5", "cancelled"),
    ]

    result = filter_open_jobs(jobs)

    assert [job.job_id for job in result] == ["J1", "J4"]


def test_empty_input_returns_empty_list():
    result = filter_open_jobs([])

    assert result == []


def test_all_jobs_filtered_out_returns_empty_list():
    jobs = [_build_job("J1", "assigned"), _build_job("J2", "cancelled")]

    result = filter_open_jobs(jobs)

    assert result == []


def test_ordering_is_preserved():
    jobs = [
        _build_job("J5", "open"),
        _build_job("J2", "assigned"),
        _build_job("J1", "open"),
        _build_job("J9", "open"),
    ]

    result = filter_open_jobs(jobs)

    assert [job.job_id for job in result] == ["J5", "J1", "J9"]


def test_input_list_is_not_mutated():
    jobs = [_build_job("J1", "open"), _build_job("J2", "assigned")]
    jobs_before = copy.deepcopy(jobs)

    filter_open_jobs(jobs)

    assert jobs == jobs_before
    assert len(jobs) == 2


def test_returned_objects_are_the_original_job_objects():
    open_job = _build_job("J1", "open")
    jobs = [open_job, _build_job("J2", "cancelled")]

    result = filter_open_jobs(jobs)

    assert result[0] is open_job


def test_filtering_is_deterministic():
    jobs = [
        _build_job("J1", "open"),
        _build_job("J2", "assigned"),
        _build_job("J3", "open"),
    ]

    first = filter_open_jobs(jobs)
    second = filter_open_jobs(jobs)

    assert first == second
    assert [job.job_id for job in first] == [job.job_id for job in second]


def test_draft_jobs_are_removed():
    jobs = [_build_job("J1", "open"), _build_job("J2", "draft")]

    result = filter_open_jobs(jobs)

    assert [job.job_id for job in result] == ["J1"]


def test_expired_jobs_are_removed():
    jobs = [_build_job("J1", "open"), _build_job("J2", "expired")]

    result = filter_open_jobs(jobs)

    assert [job.job_id for job in result] == ["J1"]


def test_partially_assigned_job_still_needing_workers_is_retained():
    # requiredWorkers=3, filledWorkers=1 -> still needs 2 more.
    job = _build_job("J1", "partially_assigned", required_workers=3, filled_workers=1)

    result = filter_open_jobs([job])

    assert [j.job_id for j in result] == ["J1"]


def test_partially_assigned_job_that_is_fully_filled_is_removed():
    # requiredWorkers == filledWorkers -> no longer accepting anyone.
    job = _build_job("J1", "partially_assigned", required_workers=2, filled_workers=2)

    result = filter_open_jobs([job])

    assert result == []


def test_mixed_statuses_including_partially_assigned_and_draft():
    jobs = [
        _build_job("J1", "open"),
        _build_job("J2", "draft"),
        _build_job("J3", "partially_assigned", required_workers=3, filled_workers=1),
        _build_job("J4", "partially_assigned", required_workers=2, filled_workers=2),
        _build_job("J5", "assigned"),
        _build_job("J6", "expired"),
    ]

    result = filter_open_jobs(jobs)

    assert [job.job_id for job in result] == ["J1", "J3"]
