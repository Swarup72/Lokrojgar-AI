from app.matching.pay_match import calculate_pay_match


def test_missing_worker_expected_pay():
    result = calculate_pay_match(None, 900, "daily")

    assert result.comparable is False
    assert result.score is None
    assert "worker expected pay" in result.reason


def test_missing_job_offered_pay():
    result = calculate_pay_match(800, None, "daily")

    assert result.comparable is False
    assert result.score is None
    assert "job offered pay" in result.reason


def test_both_pay_values_missing():
    result = calculate_pay_match(None, None, "daily")

    assert result.comparable is False
    assert "worker expected pay" in result.reason
    assert "job offered pay" in result.reason


def test_zero_worker_expected_pay():
    result = calculate_pay_match(0, 900, "daily")

    assert result.comparable is False
    assert result.score is None


def test_zero_job_offered_pay():
    result = calculate_pay_match(800, 0, "daily")

    assert result.comparable is False
    assert result.score is None


def test_negative_pay_values_are_rejected():
    result = calculate_pay_match(-100, 900, "daily")

    assert result.comparable is False
    assert result.score is None


def test_exact_numeric_match_is_still_not_comparable():
    # Even when the two numbers are identical, v1 cannot confirm they are
    # on the same basis (no worker-side pay unit exists), so it must not
    # claim a verified match just because the numbers happen to line up.
    result = calculate_pay_match(800, 800, "daily")

    assert result.comparable is False
    assert result.score is None
    assert result.worker_expected_pay == 800
    assert result.job_offered_pay == 800


def test_job_offers_more_than_expected_is_still_not_comparable():
    result = calculate_pay_match(800, 1200, "daily")

    assert result.comparable is False
    assert result.score is None


def test_job_offers_less_than_expected_is_still_not_comparable():
    result = calculate_pay_match(800, 500, "daily")

    assert result.comparable is False
    assert result.score is None


def test_not_comparable_regardless_of_job_pay_type():
    # There is no worker-side pay type to compare against, so the verdict
    # must be identical no matter which job pay type is involved.
    daily_result = calculate_pay_match(800, 800, "daily")
    monthly_result = calculate_pay_match(800, 800, "monthly")
    fixed_result = calculate_pay_match(800, 800, "fixed")

    assert daily_result.comparable is False
    assert monthly_result.comparable is False
    assert fixed_result.comparable is False


def test_unknown_pay_type_string_does_not_crash():
    result = calculate_pay_match(800, 800, "weekly")

    assert result.comparable is False
    assert "weekly" in result.reason


def test_missing_job_pay_type_produces_readable_reason():
    result = calculate_pay_match(800, 800, None)

    assert result.comparable is False
    assert result.reason.endswith("job pay amount.")
