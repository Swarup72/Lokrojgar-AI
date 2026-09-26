from app.matching.rating_features import extract_worker_rating_avg
from app.matching.rating_match import calculate_rating_match
from app.models.worker import WorkerProfile


def _build_worker(rating_avg=None) -> WorkerProfile:
    kwargs = dict(
        userId="USER001",
        fullName="Ramesh Patil",
        location={"type": "Point", "coordinates": [73.8567, 18.5204]},
    )
    if rating_avg is not None:
        kwargs["ratingAvg"] = rating_avg

    return WorkerProfile(**kwargs)


def test_extract_worker_rating_avg_default_is_zero():
    worker = _build_worker()

    assert extract_worker_rating_avg(worker) == 0


def test_extract_worker_rating_avg_explicit_value():
    worker = _build_worker(rating_avg=4.5)

    assert extract_worker_rating_avg(worker) == 4.5


def test_worker_profile_to_rating_match_with_real_rating():
    worker = _build_worker(rating_avg=4.5)

    rating_avg = extract_worker_rating_avg(worker)
    result = calculate_rating_match(rating_avg)

    assert result.rating_available is True
    assert result.score == 87.5
    assert result.rating_avg == 4.5


def test_worker_profile_to_rating_match_cold_start():
    worker = _build_worker()  # no ratingAvg given -> defaults to 0

    rating_avg = extract_worker_rating_avg(worker)
    result = calculate_rating_match(rating_avg)

    assert result.rating_available is False
    assert result.score is None
    assert "not received any ratings" in result.reason
