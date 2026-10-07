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


# =============================================================================
# A WORKER WITH NO LOCATION
#
# WorkerProfile.location used to be required, which only held together because
# the Node backend seeded every newly registered profile with Pune city-centre
# coordinates. Those are real, valid coordinates, so this matcher scored them as
# fact: measured against the running service with both side by side, a worker
# carrying the placeholder scored location=96.5 for a Pune job from a value they
# had never supplied, while the same worker with no location now scores None.
#
# "No location" is therefore reported as UNAVAILABLE, exactly as
# calculate_rating_match reports a worker who has never been rated.
# calculate_ranking already excludes a None factor from both the numerator and
# the denominator, so no weight and no formula changed to support this.
# =============================================================================


def test_worker_with_no_location_is_unavailable_not_zero():
    result = calculate_location_match(None, [73.85, 18.52], 20)

    assert result.score is None, "0 would claim 'maximally far', which the data does not support"
    assert result.location_available is False
    assert result.distance_km is None
    assert result.within_radius is False
    assert "worker" in result.reason


def test_job_with_no_location_is_also_unavailable():
    result = calculate_location_match([73.85, 18.52], None, 20)

    assert result.score is None
    assert result.location_available is False
    assert "job" in result.reason


def test_both_sides_missing_is_unavailable():
    result = calculate_location_match(None, None, 20)

    assert result.score is None
    assert result.location_available is False


def test_a_missing_location_is_not_confused_with_a_zero_radius():
    # A zero radius is a real, computed answer: the worker will not travel, so
    # the score is genuinely 0. A missing location is unknown, which is not the
    # same thing and must not collapse into it.
    no_radius = calculate_location_match([73.85, 18.52], [73.85, 18.52], 0)
    assert no_radius.score == 0.0
    assert no_radius.location_available is True

    no_location = calculate_location_match(None, [73.85, 18.52], 0)
    assert no_location.score is None
    assert no_location.location_available is False


def test_a_present_location_still_scores_exactly_as_before():
    # The whole point of the change is that nothing about a real location moved.
    same_point = calculate_location_match([73.85, 18.52], [73.85, 18.52], 20)
    assert same_point.score == 100.0
    assert same_point.location_available is True
    assert same_point.distance_km == 0.0
    assert same_point.within_radius is True

    out_of_range = calculate_location_match([73.85, 18.52], [80.0, 25.0], 20)
    assert out_of_range.score == 0.0
    assert out_of_range.location_available is True
    assert out_of_range.distance_km > 20
    assert out_of_range.within_radius is False
