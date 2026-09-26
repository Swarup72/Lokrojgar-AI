import pytest

from app.matching.location_match import calculate_distance_km, calculate_location_match


def test_same_location():
    worker_location = [73.8567, 18.5204]
    job_location = [73.8567, 18.5204]

    distance = calculate_distance_km(worker_location, job_location)

    assert distance == 0.0


def test_location_score_for_same_location():
    worker_location = [73.8567, 18.5204]
    job_location = [73.8567, 18.5204]

    result = calculate_location_match(worker_location, job_location, 20)

    assert result.score == 100.0
    assert result.distance_km == 0.0
    assert result.within_radius is True


def test_location_score_for_nearby_location():
    worker_location = [73.8567, 18.5204]
    job_location = [73.8446, 18.5314]  # a couple of km away, within a 20km radius

    result = calculate_location_match(worker_location, job_location, 20)

    assert 0.0 < result.score < 100.0
    assert result.within_radius is True


def test_location_score_outside_radius():
    worker_location = [73.8567, 18.5204]
    job_location = [73.8567, 19.9975]

    result = calculate_location_match(worker_location, job_location, 20)

    assert result.score == 0.0
    assert result.within_radius is False


def test_location_score_at_radius_boundary():
    worker_location = [73.8567, 18.5204]
    job_location = [73.8567, 18.7003]

    # Use the exact computed distance as the radius, so distance == radius
    # precisely - the genuine boundary case, not an approximation of it.
    distance_km = calculate_distance_km(worker_location, job_location)
    result = calculate_location_match(worker_location, job_location, distance_km)

    assert result.score == 0.0
    assert result.within_radius is False


def test_invalid_radius():
    worker_location = [73.8567, 18.5204]
    job_location = [73.8567, 18.5204]

    result = calculate_location_match(worker_location, job_location, 0)

    assert result.score == 0.0
    assert result.within_radius is False


def test_invalid_coordinate_structure_raises():
    worker_location = [73.8567]  # missing latitude
    job_location = [73.8567, 18.5204]

    with pytest.raises(ValueError):
        calculate_distance_km(worker_location, job_location)
