from app.matching.rating_match import calculate_rating_match


def test_rating_one_is_lowest_real_score():
    result = calculate_rating_match(1)

    assert result.rating_available is True
    assert result.score == 0.0


def test_rating_five_is_highest_score():
    result = calculate_rating_match(5)

    assert result.rating_available is True
    assert result.score == 100.0


def test_rating_three_is_midpoint():
    result = calculate_rating_match(3)

    assert result.rating_available is True
    assert result.score == 50.0


def test_non_integer_rating_normalizes_correctly():
    result = calculate_rating_match(4.5)

    assert result.rating_available is True
    assert result.score == 87.5


def test_zero_rating_is_cold_start_not_a_low_score():
    result = calculate_rating_match(0)

    assert result.rating_available is False
    assert result.score is None
    assert "not received any ratings" in result.reason


def test_missing_rating_value():
    result = calculate_rating_match(None)

    assert result.rating_available is False
    assert result.score is None
    assert "No rating value was provided" in result.reason


def test_rating_above_valid_range_is_rejected():
    result = calculate_rating_match(6)

    assert result.rating_available is False
    assert result.score is None
    assert "outside the valid 1-5 range" in result.reason


def test_rating_below_valid_range_is_rejected():
    result = calculate_rating_match(-1)

    assert result.rating_available is False
    assert result.score is None


def test_rating_between_zero_and_one_is_rejected():
    # Mathematically impossible from real data (individual ratings are
    # always >= 1), but the pure function must still respond sanely if
    # called directly with an out-of-range value.
    result = calculate_rating_match(0.5)

    assert result.rating_available is False
    assert result.score is None
    assert "outside the valid 1-5 range" in result.reason
