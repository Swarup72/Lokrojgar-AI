from app.models.job import Job
from app.models.worker import WorkerProfile


def extract_worker_location(worker: WorkerProfile) -> list[float]:
    """
    Extract canonical [longitude, latitude] coordinates from a WorkerProfile.
    """

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
