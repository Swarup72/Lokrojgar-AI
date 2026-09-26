from typing import Optional

from app.models.job import Job
from app.models.worker import WorkerProfile


def extract_worker_expected_pay(worker: WorkerProfile) -> Optional[float]:
    """
    Extract the worker's expected pay.

    Note: unlike Job, WorkerProfile has no field declaring what unit or
    period this number is denominated in.
    """

    return worker.expected_pay


def extract_job_offered_pay(job: Job) -> float:
    """
    Extract the job's offered pay amount.
    """

    return job.pay_amount


def extract_job_pay_type(job: Job) -> str:
    """
    Extract the job's pay type ("daily" / "monthly" / "fixed").
    """

    return job.pay_type
