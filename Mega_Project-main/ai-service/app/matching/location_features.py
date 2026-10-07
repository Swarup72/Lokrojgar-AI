from typing import Optional

from app.models.job import Job
from app.models.worker import WorkerProfile


def extract_worker_location(worker: WorkerProfile) -> Optional[list[float]]:
    """
    Extract canonical [longitude, latitude] coordinates from a WorkerProfile.

    Returns None when the worker has not set a location. That is a real state,
    not an error: a newly registered worker has no location until they provide
    one. It must NOT be substituted with a default city - doing so is what made
    every new worker look like they lived in central Pune.
    """

    if worker.location is None:
        return None

    return worker.location.coordinates


def extract_job_location(job: Job) -> list[float]:
    """
    Extract canonical [longitude, latitude] coordinates from a Job.
    """

    return job.location.coordinates


def extract_worker_preferred_radius_km(worker: WorkerProfile) -> float:
    """
    Extract the worker's preferred work radius, in kilometers.
    """

    return worker.preferred_work_radius_km
