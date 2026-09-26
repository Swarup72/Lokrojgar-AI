from app.matching.availability_match import calculate_availability_match


def test_available_worker_open_job_is_compatible():
    result = calculate_availability_match("available", "open")

    assert result.compatible is True
    assert result.score == 100.0


def test_busy_worker_open_job_is_incompatible():
    result = calculate_availability_match("busy", "open")

    assert result.compatible is False
    assert result.score == 0.0
    assert "worker availability is 'busy'" in result.reason


def test_unavailable_worker_open_job_is_incompatible():
    result = calculate_availability_match("unavailable", "open")

    assert result.compatible is False
    assert result.score == 0.0


def test_available_worker_assigned_job_is_incompatible():
    result = calculate_availability_match("available", "assigned")

    assert result.compatible is False
    assert result.score == 0.0
    assert "job status is 'assigned'" in result.reason


def test_available_worker_completed_job_is_incompatible():
    result = calculate_availability_match("available", "completed")

    assert result.compatible is False
    assert result.score == 0.0


def test_available_worker_cancelled_job_is_incompatible():
    result = calculate_availability_match("available", "cancelled")

    assert result.compatible is False
    assert result.score == 0.0


def test_both_sides_incompatible_reason_mentions_both():
    result = calculate_availability_match("unavailable", "cancelled")

    assert result.compatible is False
    assert result.score == 0.0
    assert "worker availability is 'unavailable'" in result.reason
    assert "job status is 'cancelled'" in result.reason


def test_case_and_whitespace_are_normalized():
    result = calculate_availability_match("  Available  ", "OPEN")

    assert result.compatible is True
    assert result.score == 100.0


def test_missing_worker_availability_is_incompatible():
    result = calculate_availability_match("", "open")

    assert result.compatible is False
    assert result.score == 0.0


def test_missing_job_status_is_incompatible():
    result = calculate_availability_match("available", "")

    assert result.compatible is False
    assert result.score == 0.0
