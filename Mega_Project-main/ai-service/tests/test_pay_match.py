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
    assert result.score is None
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


def test_exact_numeric_match_is_perfect_score():
    result = calculate_pay_match(800, 800, "daily")

    assert result.comparable is True
    assert result.score == 100.0
    assert result.worker_expected_pay == 800
    assert result.job_offered_pay == 800


def test_job_offers_more_than_expected():
    # Worker expects ₹800/day; job pays ₹850/day.
    result = calculate_pay_match(800, 850, "daily")

    assert result.comparable is True
    assert result.score == 100.0
    assert "meets or exceeds" in result.reason


def test_job_offers_significantly_more_than_expected():
    result = calculate_pay_match(800, 1200, "daily")

    assert result.comparable is True
    assert result.score == 100.0


def test_job_offers_slightly_less_than_expected():
    # Worker expects ₹900/day; job pays ₹800/day.
    # 800 / 900 = 88.888...% -> 88.9
    result = calculate_pay_match(900, 800, "daily")

    assert result.comparable is True
    assert result.score == 88.9
    assert "88.9%" in result.reason


def test_job_offers_severely_less_than_expected_scores_zero():
    # Worker expects ₹1000/day; job pays ₹400/day (< 50%).
    # Must produce a valid numeric score of 0.0, NOT None.
    result = calculate_pay_match(1000, 400, "daily")

    assert result.comparable is True
    assert result.score == 0.0
    assert result.score is not None
    assert "< 50%" in result.reason


def test_monthly_pay_type_normalization():
    # Worker expects ₹800/day; monthly job pays ₹20,800/month (26 days * 800).
    result = calculate_pay_match(800, 20800, "monthly")

    assert result.comparable is True
    assert result.score == 100.0


def test_monthly_pay_proportional_match():
    # Worker expects ₹800/day; monthly job pays ₹15,600/month (26 days * 600 = ₹600/day).
    # 600 / 800 = 75.0%
    result = calculate_pay_match(800, 15600, "monthly")

    assert result.comparable is True
    assert result.score == 75.0


def test_fixed_pay_type_is_not_comparable():
    # Fixed-contract compensation cannot be safely compared without duration.
    result = calculate_pay_match(800, 5000, "fixed")

    assert result.comparable is False
    assert result.score is None
    assert "Fixed-contract" in result.reason


def test_unknown_pay_type_string_does_not_crash():
    result = calculate_pay_match(800, 800, "weekly")

    assert result.comparable is False
    assert result.score is None
    assert "weekly" in result.reason


def test_missing_job_pay_type_produces_readable_reason():
    result = calculate_pay_match(800, 800, None)

    assert result.comparable is False
    assert result.score is None
    assert "missing" in result.reason.lower()
