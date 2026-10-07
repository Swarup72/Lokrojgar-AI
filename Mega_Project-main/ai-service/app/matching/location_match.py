from math import atan2, cos, radians, sin, sqrt
from typing import Optional

from pydantic import BaseModel


class LocationMatchResult(BaseModel):
    # None means "could not be computed" - one side has no location on record.
    # This is the same convention RatingMatchResult already uses for a worker
    # who has never been rated, and calculate_ranking() already excludes a None
    # factor from both the numerator and the denominator rather than treating it
    # as zero. No ranking weight or formula changed to support this.
    score: Optional[float]
    distance_km: Optional[float]
    within_radius: bool
    location_available: bool = True
    reason: str = ""


def calculate_distance_km(
    worker_location: list[float],
    job_location: list[float],
) -> float:
    """
    Calculate the great-circle distance between two points using the
    Haversine formula.

    Locations use GeoJSON coordinate order: [longitude, latitude].

    Returns distance in kilometers.
    """

    worker_longitude, worker_latitude = worker_location
    job_longitude, job_latitude = job_location

    earth_radius_km = 6371.0

    worker_latitude_rad = radians(worker_latitude)
    job_latitude_rad = radians(job_latitude)

    latitude_difference_rad = radians(job_latitude - worker_latitude)
    longitude_difference_rad = radians(job_longitude - worker_longitude)

    a = (
        sin(latitude_difference_rad / 2) ** 2
        + cos(worker_latitude_rad)
        * cos(job_latitude_rad)
        * sin(longitude_difference_rad / 2) ** 2
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return earth_radius_km * c


def calculate_location_match(
    worker_location: Optional[list[float]],
    job_location: Optional[list[float]],
    preferred_radius_km: float,
) -> LocationMatchResult:
    """
    Calculate location compatibility between a worker and a job.

    Score is 100 at zero distance, decreases linearly as distance
    increases, and is 0 once distance reaches or exceeds
    preferred_radius_km. A radius of zero or less has no usable travel
    range, so the score is 0 regardless of distance.

    distance_km is always the real computed distance, even when the score
    is 0 - it describes physical distance, not compatibility.
    """

    # No location on one side means there is no distance to measure. Reporting
    # 0 here would be a claim ("maximally far / incompatible") that the data does
    # not support, and substituting a default location would be worse: it would
    # invent a position and score it as fact.
    if worker_location is None or job_location is None:
        missing = "worker" if worker_location is None else "job"
        return LocationMatchResult(
            score=None,
            distance_km=None,
            within_radius=False,
            location_available=False,
            reason=f"No location on record for the {missing}, so distance could not be computed.",
        )

    distance_km = calculate_distance_km(worker_location, job_location)

    if preferred_radius_km <= 0:
        return LocationMatchResult(
            score=0.0,
            distance_km=distance_km,
            within_radius=False,
        )

    within_radius = distance_km < preferred_radius_km

    if not within_radius:
        return LocationMatchResult(
            score=0.0,
            distance_km=distance_km,
            within_radius=False,
        )

    score = (1 - (distance_km / preferred_radius_km)) * 100

    return LocationMatchResult(
        score=score,
        distance_km=distance_km,
        within_radius=True,
    )
