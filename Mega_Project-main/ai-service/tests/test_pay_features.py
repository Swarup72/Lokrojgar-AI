from app.matching.pay_features import (
    extract_job_offered_pay,
    extract_job_pay_type,
    extract_worker_expected_pay,
)
from app.matching.pay_match import calculate_pay_match
from app.models.job import Job
from app.models.worker import WorkerProfile


def _build_worker(expected_pay=None) -> WorkerProfile:
    return WorkerProfile(
        userId="USER001",
        fullName="Ramesh Patil",
        location={"type": "Point", "coordinates": [73.8567, 18.5204]},
        expectedPay=expected_pay,
    )


def _build_job(pay_amount=900, pay_type="daily") -> Job:
    return Job(
        employerId="EMP001",
        location={"type": "Point", "coordinates": [73.8446, 18.5314]},
        payType=pay_type,
        payAmount=pay_amount,
        requiredWorkers=1,
        startDate="2026-10-01T00:00:00Z",
        categoryId="CAT001",
        originalLanguage="en",
    )


def test_extract_worker_expected_pay_present():
    worker = _build_worker(expected_pay=800)

    assert extract_worker_expected_pay(worker) == 800


def test_extract_worker_expected_pay_missing():
    worker = _build_worker(expected_pay=None)

    assert extract_worker_expected_pay(worker) is None


def test_extract_job_offered_pay():
    job = _build_job(pay_amount=1200)

    assert extract_job_offered_pay(job) == 1200


def test_extract_job_pay_type():
    job = _build_job(pay_type="monthly")

    assert extract_job_pay_type(job) == "monthly"


def test_worker_profile_to_job_pay_match_reports_not_comparable():
    worker = _build_worker(expected_pay=800)
    job = _build_job(pay_amount=900, pay_type="daily")

    worker_expected_pay = extract_worker_expected_pay(worker)
    job_offered_pay = extract_job_offered_pay(job)
    job_pay_type = extract_job_pay_type(job)

    result = calculate_pay_match(worker_expected_pay, job_offered_pay, job_pay_type)

    assert result.comparable is False
    assert result.score is None
    assert result.worker_expected_pay == 800
    assert result.job_offered_pay == 900
    assert result.job_pay_type == "daily"


def test_worker_profile_with_no_expected_pay_reports_missing_data():
    worker = _build_worker(expected_pay=None)
    job = _build_job()

    worker_expected_pay = extract_worker_expected_pay(worker)
    job_offered_pay = extract_job_offered_pay(job)
    job_pay_type = extract_job_pay_type(job)

    result = calculate_pay_match(worker_expected_pay, job_offered_pay, job_pay_type)

    assert result.comparable is False
    assert "worker expected pay" in result.reason
