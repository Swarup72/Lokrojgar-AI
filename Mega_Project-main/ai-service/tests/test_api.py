from fastapi.testclient import TestClient

from app.main import app
from app.models.job import Job
from app.models.worker import WorkerProfile

client = TestClient(app)

FACTOR_ORDER = ["skill", "location", "availability", "pay", "rating", "relevance"]


def _worker_payload(**overrides) -> dict:
    defaults = dict(
        worker_id="WORKER001",
        user_id="USER001",
        full_name="Test Worker",
        location={"type": "Point", "coordinates": [73.8567, 18.5204]},
        availability="available",
        rating_avg=0,
        experience_years=0,
    )
    defaults.update(overrides)
    worker = WorkerProfile(**defaults)
    return worker.model_dump(mode="json", by_alias=True, exclude_none=True)


def _job_payload(**overrides) -> dict:
    defaults = dict(
        job_id="JOB001",
        employer_id="EMP001",
        location={"type": "Point", "coordinates": [73.8446, 18.5314]},
        pay_type="daily",
        pay_amount=900,
        required_workers=1,
        start_date="2026-10-01T00:00:00Z",
        category_id="CAT001",
        original_language="en",
        skill_ids=[],
        status="open",
    )
    defaults.update(overrides)
    job = Job(**defaults)
    return job.model_dump(mode="json", by_alias=True, exclude_none=True)


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_worker_to_jobs_success():
    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["direction"] == "worker_to_jobs"
    assert body["anchor_id"] == "WORKER001"
    assert len(body["matches"]) == 1


def test_job_to_workers_success():
    response = client.post(
        "/recommendations/workers-for-job",
        json={"job": _job_payload(), "workers": [_worker_payload()], "worker_skills": []},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["direction"] == "job_to_workers"
    assert body["anchor_id"] == "JOB001"
    assert len(body["matches"]) == 1


def test_invalid_request_returns_422():
    # "worker" is a required field of the request body - omitting it
    # entirely must fail Pydantic validation, not be silently accepted.
    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker_skills": [], "jobs": [_job_payload()]},
    )

    assert response.status_code == 422


def test_top_k_zero_returns_400():
    response = client.post(
        "/recommendations/jobs-for-worker",
        json={
            "worker": _worker_payload(),
            "worker_skills": [],
            "jobs": [_job_payload()],
            "top_k": 0,
        },
    )

    assert response.status_code == 400


def test_missing_api_key_returns_401_when_configured(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")

    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]},
    )

    assert response.status_code == 401


def test_invalid_api_key_returns_401(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")

    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]},
        headers={"X-AI-Service-Key": "wrong-key"},
    )

    assert response.status_code == 401


def test_valid_api_key_returns_success(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")

    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]},
        headers={"X-AI-Service-Key": "secret123"},
    )

    assert response.status_code == 200


def test_response_contains_ranking():
    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]},
    )

    ranking = response.json()["matches"][0]["ranking"]
    assert "overall_score" in ranking
    assert "match_factors" in ranking
    assert "available_factors" in ranking
    assert "unavailable_factors" in ranking


def test_response_contains_match_factors():
    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]},
    )

    match_factors = response.json()["matches"][0]["ranking"]["match_factors"]
    assert set(match_factors.keys()) == set(FACTOR_ORDER)


def test_response_contains_explanation():
    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]},
    )

    explanation = response.json()["matches"][0]["explanation"]
    assert "overall_score" in explanation
    assert "factors" in explanation
    assert "summary" in explanation


def test_explanation_factor_order():
    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]},
    )

    explanation = response.json()["matches"][0]["explanation"]
    assert [f["factor"] for f in explanation["factors"]] == FACTOR_ORDER


def test_node_shaped_worker_profile():
    # Hand-written, not derived from our own Pydantic model - shaped exactly
    # like a real Mongoose document serialized to JSON, to prove the alias
    # mapping works against real Node output, not just our own fixtures.
    node_worker = {
        "_id": "68b6f2c8a1234567890abcd",
        "userId": "68b6f2c8a1234567890abce",
        "fullName": "Ramesh Patil",
        "location": {"type": "Point", "coordinates": [74.5815, 16.8524]},
        "availability": "available",
        "expectedPay": 800,
        "ratingAvg": 4.5,
        "ratingCount": 12,
        "languages": ["mr", "hi", "en"],
        "preferredJobCategories": ["68b6f31aa1234567890abcde"],
        "preferredWorkRadiusKm": 25,
        "experienceYears": 6,
    }

    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": node_worker, "worker_skills": [], "jobs": [_job_payload()]},
    )

    assert response.status_code == 200
    assert response.json()["anchor_id"] == "68b6f2c8a1234567890abcd"


def test_multilingual_bio_accepted():
    worker = _worker_payload(bio={"mr": "अनुभवी प्लंबर", "hi": "अनुभवी प्लंबर", "en": "Experienced plumber"})

    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": worker, "worker_skills": [], "jobs": [_job_payload()]},
    )

    assert response.status_code == 200


def test_real_job_status_values_accepted_and_partially_assigned_with_room_is_eligible():
    job = _job_payload(status="partially_assigned", required_workers=3, filled_workers=1)

    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [job]},
    )

    assert response.status_code == 200
    assert len(response.json()["matches"]) == 1


def test_partially_assigned_fully_filled_job_is_excluded():
    job = _job_payload(status="partially_assigned", required_workers=2, filled_workers=2)

    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [job]},
    )

    assert response.status_code == 200
    assert response.json()["matches"] == []


def test_deterministic_response():
    payload = {"worker": _worker_payload(), "worker_skills": [], "jobs": [_job_payload()]}

    first = client.post("/recommendations/jobs-for-worker", json=payload)
    second = client.post("/recommendations/jobs-for-worker", json=payload)

    assert first.json() == second.json()


def test_none_vs_zero_preserved_through_the_api():
    # skill_ids on the job with no overlap against the worker's (empty)
    # skills -> a REAL score of 0.0. pay is always None in this system
    # (no worker-side pay unit). Both must be distinguishable in the
    # response, not collapsed into the same thing.
    job = _job_payload(skill_ids=["S001"])

    response = client.post(
        "/recommendations/jobs-for-worker",
        json={"worker": _worker_payload(), "worker_skills": [], "jobs": [job]},
    )

    match_factors = response.json()["matches"][0]["ranking"]["match_factors"]
    assert match_factors["skill"] == 0.0
    assert match_factors["pay"] is None

    factors_by_name = {f["factor"]: f for f in response.json()["matches"][0]["explanation"]["factors"]}
    assert factors_by_name["skill"]["available"] is True
    assert factors_by_name["pay"]["available"] is False


# --- /recommendations/score-pair ------------------------------------------
# Used by Node's applyForJob to score exactly one worker/job pair.


def test_score_pair_success():
    response = client.post(
        "/recommendations/score-pair",
        json={"worker": _worker_payload(), "worker_skills": [], "job": _job_payload()},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["worker_id"] == "WORKER001"
    assert body["job_id"] == "JOB001"


def test_score_pair_contains_ranking_and_explanation():
    response = client.post(
        "/recommendations/score-pair",
        json={"worker": _worker_payload(), "worker_skills": [], "job": _job_payload()},
    )

    body = response.json()
    assert set(body["ranking"]["match_factors"].keys()) == set(FACTOR_ORDER)
    assert [f["factor"] for f in body["explanation"]["factors"]] == FACTOR_ORDER


def test_score_pair_none_vs_zero_preserved():
    job = _job_payload(skill_ids=["S001"])  # worker has no skills -> real 0, not missing

    response = client.post(
        "/recommendations/score-pair",
        json={"worker": _worker_payload(), "worker_skills": [], "job": job},
    )

    match_factors = response.json()["ranking"]["match_factors"]
    assert match_factors["skill"] == 0.0
    assert match_factors["pay"] is None
    assert match_factors["rating"] is None  # cold-start default rating_avg=0


def test_score_pair_is_deterministic():
    payload = {"worker": _worker_payload(), "worker_skills": [], "job": _job_payload()}

    first = client.post("/recommendations/score-pair", json=payload)
    second = client.post("/recommendations/score-pair", json=payload)

    assert first.json() == second.json()


def test_score_pair_invalid_request_returns_422():
    response = client.post("/recommendations/score-pair", json={"worker_skills": [], "job": _job_payload()})

    assert response.status_code == 422


def test_score_pair_requires_api_key_when_configured(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")

    response = client.post(
        "/recommendations/score-pair",
        json={"worker": _worker_payload(), "worker_skills": [], "job": _job_payload()},
    )

    assert response.status_code == 401


def test_score_pair_with_valid_api_key_succeeds(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")

    response = client.post(
        "/recommendations/score-pair",
        json={"worker": _worker_payload(), "worker_skills": [], "job": _job_payload()},
        headers={"X-AI-Service-Key": "secret123"},
    )

    assert response.status_code == 200
