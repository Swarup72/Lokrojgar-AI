from app.matching.relevance_features import (
    extract_job_category_id,
    extract_job_experience_required,
    extract_job_original_language,
    extract_job_preferred_languages,
    extract_worker_experience_years,
    extract_worker_languages,
    extract_worker_preferred_categories,
)
from app.matching.relevance_match import calculate_relevance_match
from app.models.job import Job
from app.models.worker import WorkerProfile


def _build_worker(
    preferred_categories=None,
    languages=None,
    experience_years=0,
) -> WorkerProfile:
    return WorkerProfile(
        userId="USER001",
        fullName="Ramesh Patil",
        location={"type": "Point", "coordinates": [73.8567, 18.5204]},
        preferredJobCategories=preferred_categories or [],
        languages=languages or ["mr"],
        experienceYears=experience_years,
    )


def _build_job(
    category_id="CAT001",
    preferred_languages=None,
    original_language="en",
    experience_required=0,
) -> Job:
    return Job(
        employerId="EMP001",
        location={"type": "Point", "coordinates": [73.8446, 18.5314]},
        payType="daily",
        payAmount=900,
        requiredWorkers=1,
        startDate="2026-10-01T00:00:00Z",
        categoryId=category_id,
        originalLanguage=original_language,
        preferredLanguages=preferred_languages or [],
        experienceRequired=experience_required,
    )


def test_extract_worker_preferred_categories():
    worker = _build_worker(preferred_categories=["CAT001"])

    assert extract_worker_preferred_categories(worker) == ["CAT001"]


def test_extract_worker_languages():
    worker = _build_worker(languages=["mr", "hi"])

    assert extract_worker_languages(worker) == ["mr", "hi"]


def test_extract_worker_experience_years():
    worker = _build_worker(experience_years=5)

    assert extract_worker_experience_years(worker) == 5


def test_extract_job_category_id():
    job = _build_job(category_id="CAT002")

    assert extract_job_category_id(job) == "CAT002"


def test_extract_job_preferred_languages():
    job = _build_job(preferred_languages=["hi", "en"])

    assert extract_job_preferred_languages(job) == ["hi", "en"]


def test_extract_job_original_language():
    job = _build_job(original_language="mr")

    assert extract_job_original_language(job) == "mr"


def test_extract_job_experience_required():
    job = _build_job(experience_required=3)

    assert extract_job_experience_required(job) == 3


def test_worker_profile_to_job_relevance_full_match():
    worker = _build_worker(
        preferred_categories=["CAT001"],
        languages=["en", "hi"],
        experience_years=5,
    )
    job = _build_job(
        category_id="CAT001",
        preferred_languages=["hi"],
        original_language="en",
        experience_required=2,
    )

    result = calculate_relevance_match(
        worker_preferred_categories=extract_worker_preferred_categories(worker),
        job_category_id=extract_job_category_id(job),
        worker_languages=extract_worker_languages(worker),
        job_preferred_languages=extract_job_preferred_languages(job),
        job_original_language=extract_job_original_language(job),
        worker_experience_years=extract_worker_experience_years(worker),
        job_experience_required=extract_job_experience_required(job),
    )

    assert result.score == 100.0
    assert result.matched_signals == ["category", "language", "experience"]


def test_worker_profile_to_job_relevance_partial_match():
    worker = _build_worker(
        preferred_categories=[],  # no stated preference
        languages=["mr"],
        experience_years=1,
    )
    job = _build_job(
        category_id="CAT001",
        preferred_languages=[],
        original_language="hi",  # worker doesn't speak "hi"
        experience_required=5,
    )

    result = calculate_relevance_match(
        worker_preferred_categories=extract_worker_preferred_categories(worker),
        job_category_id=extract_job_category_id(job),
        worker_languages=extract_worker_languages(worker),
        job_preferred_languages=extract_job_preferred_languages(job),
        job_original_language=extract_job_original_language(job),
        worker_experience_years=extract_worker_experience_years(worker),
        job_experience_required=extract_job_experience_required(job),
    )

    assert result.not_applicable_signals == ["category"]
    assert result.unmatched_signals == ["language", "experience"]
    assert result.score == 0.0
