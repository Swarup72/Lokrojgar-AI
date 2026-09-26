from app.models.job import Job
from app.models.worker import WorkerProfile


def extract_worker_preferred_categories(worker: WorkerProfile) -> list[str]:
    return worker.preferred_job_categories


def extract_worker_languages(worker: WorkerProfile) -> list[str]:
    return worker.languages


def extract_worker_experience_years(worker: WorkerProfile) -> float:
    return worker.experience_years


def extract_job_category_id(job: Job) -> str:
    return job.category_id


def extract_job_preferred_languages(job: Job) -> list[str]:
    return job.preferred_languages


def extract_job_original_language(job: Job) -> str:
    return job.original_language


def extract_job_experience_required(job: Job) -> float:
    return job.experience_required
