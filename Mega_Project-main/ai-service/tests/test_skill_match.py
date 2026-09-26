from app.matching.skill_match import calculate_skill_match


def test_all_skills_match():
    worker_skills = ["S001", "S002"]
    job_skills = ["S001", "S002"]

    result = calculate_skill_match(
        worker_skills,
        job_skills,
    )

    assert result.score == 100.0
    assert result.matched_skills == ["S001", "S002"]
    assert result.missing_skills == []


def test_partial_skill_match():
    worker_skills = ["S001"]
    job_skills = ["S001", "S002"]

    result = calculate_skill_match(
        worker_skills,
        job_skills,
    )

    assert result.score == 50.0
    assert result.matched_skills == ["S001"]
    assert result.missing_skills == ["S002"]


def test_no_skill_match():
    worker_skills = ["S003"]
    job_skills = ["S001", "S002"]

    result = calculate_skill_match(
        worker_skills,
        job_skills,
    )

    assert result.score == 0.0
    assert result.matched_skills == []
    assert result.missing_skills == ["S001", "S002"]


def test_no_required_skills():
    worker_skills = ["S001"]
    job_skills = []

    result = calculate_skill_match(
        worker_skills,
        job_skills,
    )

    assert result.score == 0.0
    assert result.matched_skills == []
    assert result.missing_skills == []


def test_worker_has_extra_skills():
    worker_skills = [
        "S001",
        "S002",
        "S003",
    ]

    job_skills = [
        "S001",
        "S002",
    ]

    result = calculate_skill_match(
        worker_skills,
        job_skills,
    )

    assert result.score == 100.0
    assert result.matched_skills == ["S001", "S002"]
    assert result.missing_skills == []


def test_duplicate_worker_skills():
    worker_skills = [
        "S001",
        "S001",
        "S002",
    ]

    job_skills = [
        "S001",
        "S002",
    ]

    result = calculate_skill_match(
        worker_skills,
        job_skills,
    )

    assert result.score == 100.0
    assert result.matched_skills == ["S001", "S002"]


def test_duplicate_job_skills():
    worker_skills = ["S001"]

    job_skills = [
        "S001",
        "S001",
        "S002",
    ]

    result = calculate_skill_match(
        worker_skills,
        job_skills,
    )

    assert result.score == 50.0
    assert result.matched_skills == ["S001"]
    assert result.missing_skills == ["S002"]


def test_empty_worker_skills():
    worker_skills = []
    job_skills = ["S001"]

    result = calculate_skill_match(
        worker_skills,
        job_skills,
    )

    assert result.score == 0.0
    assert result.matched_skills == []
    assert result.missing_skills == ["S001"]