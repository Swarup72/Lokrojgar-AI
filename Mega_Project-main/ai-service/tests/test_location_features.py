from app.matching.location_features import (
    extract_job_location,
    extract_worker_location,
    extract_worker_preferred_radius_km,
)
from app.matching.location_match import calculate_location_match
from app.models.job import Job
from app.models.worker import WorkerProfile


def _build_worker(coordinates: list[float], radius_km: float = 20) -> WorkerProfile:
    return WorkerProfile(
        userId="USER001",
        fullName="Ramesh Patil",
        location={"type": "Point", "coordinates": coordinates},
        preferredWorkRadiusKm=radius_km,
    )


def _build_job(coordinates: list[float]) -> Job:
    return Job(
        employerId="EMP001",
        location={"type": "Point", "coordinates": coordinates},
        payType="daily",
        payAmount=900,
        requiredWorkers=1,
        startDate="2026-10-01T00:00:00Z",
        categoryId="CAT001",
        originalLanguage="en",
    )


def test_extract_worker_location():
    worker = _build_worker([73.8567, 18.5204])

    assert extract_worker_location(worker) == [73.8567, 18.5204]


def test_extract_job_location():
    job = _build_job([73.8446, 18.5314])

    assert extract_job_location(job) == [73.8446, 18.5314]


def test_extract_worker_preferred_radius_km():
    worker = _build_worker([73.8567, 18.5204], radius_km=25)

    assert extract_worker_preferred_radius_km(worker) == 25


def test_worker_profile_to_job_location_match():
    worker = _build_worker([73.8567, 18.5204], radius_km=20)
    job = _build_job([73.8446, 18.5314])

    worker_location = extract_worker_location(worker)
    job_location = extract_job_location(job)
    radius_km = extract_worker_preferred_radius_km(worker)

    result = calculate_location_match(worker_location, job_location, radius_km)

    assert result.within_radius is True
    assert 0.0 < result.score <= 100.0
