from app.matching.availability_features import extract_job_status, extract_worker_availability
from app.matching.availability_match import calculate_availability_match
from app.models.job import Job
from app.models.worker import WorkerProfile


def _build_worker(availability: str = "available") -> WorkerProfile:
    return WorkerProfile(
        userId="USER001",
        fullName="Ramesh Patil",
        location={"type": "Point", "coordinates": [73.8567, 18.5204]},
        availability=availability,
    )


def _build_job(status: str = "open") -> Job:
    return Job(
        employerId="EMP001",
        location={"type": "Point", "coordinates": [73.8446, 18.5314]},
        payType="daily",
        payAmount=900,
        requiredWorkers=1,
        startDate="2026-10-01T00:00:00Z",
        categoryId="CAT001",
        originalLanguage="en",
        status=status,
    )


def test_extract_worker_availability_default():
    worker = _build_worker()

    assert extract_worker_availability(worker) == "available"


def test_extract_worker_availability_busy():
    worker = _build_worker(availability="busy")

    assert extract_worker_availability(worker) == "busy"


def test_extract_job_status_default():
    job = _build_job()

    assert extract_job_status(job) == "open"


def test_extract_job_status_cancelled():
    job = _build_job(status="cancelled")

    assert extract_job_status(job) == "cancelled"


def test_worker_profile_to_job_availability_match_compatible():
    worker = _build_worker(availability="available")
    job = _build_job(status="open")

    worker_availability = extract_worker_availability(worker)
    job_status = extract_job_status(job)

    result = calculate_availability_match(worker_availability, job_status)

    assert result.compatible is True
    assert result.score == 100.0


def test_worker_profile_to_job_availability_match_incompatible():
    worker = _build_worker(availability="unavailable")
    job = _build_job(status="assigned")

    worker_availability = extract_worker_availability(worker)
    job_status = extract_job_status(job)

    result = calculate_availability_match(worker_availability, job_status)

    assert result.compatible is False
    assert result.score == 0.0
