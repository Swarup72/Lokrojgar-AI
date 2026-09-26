from typing import Optional

from app.models.worker import WorkerProfile


def extract_worker_rating_avg(worker: WorkerProfile) -> Optional[float]:
    """
    Extract the worker's average rating.

    Sourced from WorkerProfile.rating_avg - the backend's own precomputed
    average - rather than re-deriving it from raw Rating documents.
    Recomputing reputation from individual ratings (and weighting by how
    many ratings back it) is Module 5's responsibility; this adapter only
    reads the number Module 5 is expected to maintain.
    """

    return worker.rating_avg
