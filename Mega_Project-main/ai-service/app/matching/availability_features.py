from app.models.job import Job
from app.models.worker import WorkerProfile


def extract_worker_availability(worker: WorkerProfile) -> str:
    """
    Extract the worker's availability status
    ("available" / "busy" / "unavailable").
    """

    return worker.availability


def extract_job_status(job: Job) -> str:
    """
    Extract the job's status ("open" / "assigned" / "completed" /
    "cancelled").

    Job has no field comparable to WorkerProfile.availability - no
    shift-type or working-hours preference exists on the worker side to
    compare against Job.shift_type/start_time/end_time. status is the
    closest real signal for "can this job accept a worker right now", so
    it's used as the job side of availability compatibility in v1.
    """

    return job.status
