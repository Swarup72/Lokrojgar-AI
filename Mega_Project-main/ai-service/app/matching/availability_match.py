from pydantic import BaseModel


class AvailabilityMatchResult(BaseModel):
    score: float
    compatible: bool
    reason: str


def calculate_availability_match(
    worker_availability: str,
    job_status: str,
) -> AvailabilityMatchResult:
    """
    Calculate availability compatibility between a worker and a job.

    v1 baseline: the schema only supports a coarse, binary check - is the
    worker generally available, and is the job still open to accept a
    worker. There is no worker-side field for shift type, working hours,
    or preferred days to compare against Job.shift_type/start_time/
    end_time, so those are not used here (see module docstring in
    availability_features.py for why).

    Score is binary (0 or 100), not a gradient - the underlying fields are
    categorical, so a continuous score would be manufacturing precision
    the data doesn't support.
    """

    worker_availability_normalized = (worker_availability or "").strip().lower()
    job_status_normalized = (job_status or "").strip().lower()

    worker_is_available = worker_availability_normalized == "available"
    job_is_open = job_status_normalized == "open"

    if worker_is_available and job_is_open:
        return AvailabilityMatchResult(
            score=100.0,
            compatible=True,
            reason="Worker is available and the job is open.",
        )

    reasons = []
    if not worker_is_available:
        reasons.append(
            f"worker availability is '{worker_availability_normalized or 'unknown'}'"
        )
    if not job_is_open:
        reasons.append(f"job status is '{job_status_normalized or 'unknown'}'")

    return AvailabilityMatchResult(
        score=0.0,
        compatible=False,
        reason="Not compatible: " + " and ".join(reasons) + ".",
    )
