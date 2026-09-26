import pytest
from pydantic import ValidationError

from app.data_loader import (
    load_jobs,
    load_ratings,
    load_skills,
    load_voice_profiles,
    load_worker_profiles,
    load_worker_skills,
)
from app.models import (
    GeoPoint,
    Job,
    MultilingualName,
    Rating,
    Skill,
    VoiceProfile,
    WorkerProfile,
    WorkerSkill,
)


def test_worker_profile_creation():
    worker = WorkerProfile(
        userId="USER001",
        fullName="Ramesh Patil",
        location={"type": "Point", "coordinates": [73.8567, 18.5204]},
        availability="available",
        expectedPay=800,
        ratingAvg=4.5,
        languages=["mr", "hi"],
        experienceYears=5,
    )

    assert worker.user_id == "USER001"
    assert worker.location.longitude == 73.8567
    assert worker.location.latitude == 18.5204


def test_worker_skill_creation():
    worker_skill = WorkerSkill(
        workerId="WORKER001",
        skillId="SKILL001",
        proficiency="expert",
        verificationStatus="verified",
    )

    assert worker_skill.worker_id == "WORKER001"
    assert worker_skill.skill_id == "SKILL001"
    assert worker_skill.proficiency == "expert"


def test_skill_multilingual_structure():
    skill = Skill(
        name={"mr": "प्लंबर", "hi": "प्लंबर", "en": "Plumber"},
        categoryId="CAT001",
    )

    assert isinstance(skill.name, MultilingualName)
    assert skill.name.en == "Plumber"
    assert skill.name.mr == "प्लंबर"


def test_job_creation():
    job = Job(
        employerId="EMP001",
        title={"en": "Plumber Required"},
        skillIds=["SKILL001"],
        location={"type": "Point", "coordinates": [73.8446, 18.5314]},
        payType="daily",
        payAmount=900,
        requiredWorkers=1,
        startDate="2026-10-01T00:00:00Z",
        categoryId="CAT001",
        originalLanguage="en",
    )

    assert job.pay_amount == 900
    assert job.title.en == "Plumber Required"
    assert "SKILL001" in job.skill_ids


def test_geojson_location_structure():
    point = GeoPoint(type="Point", coordinates=[73.8567, 18.5204])

    assert point.longitude == 73.8567
    assert point.latitude == 18.5204


def test_voice_profile_creation():
    profile = VoiceProfile(
        workerId="WORKER001",
        language="mr",
        audioUrl="https://example.com/audio.mp3",
        transcript="मी रमेश, प्लंबर आहे.",
        confidence=0.9,
    )

    assert profile.language == "mr"
    assert profile.confidence == 0.9


def test_rating_valid():
    rating = Rating(
        jobId="JOB001",
        fromUserId="EMPUSER001",
        toUserId="USER001",
        rating=4.5,
        review="Good work.",
    )

    assert rating.rating == 4.5


def test_dataset_loading():
    assert len(load_worker_profiles()) > 0
    assert len(load_worker_skills()) > 0
    assert len(load_skills()) > 0
    assert len(load_jobs()) > 0
    assert len(load_voice_profiles()) > 0
    assert len(load_ratings()) > 0


def test_invalid_rating_rejected():
    with pytest.raises(ValidationError):
        Rating(jobId="JOB001", fromUserId="U1", toUserId="U2", rating=6)


def test_invalid_negative_experience_rejected():
    with pytest.raises(ValidationError):
        WorkerProfile(
            userId="USER001",
            fullName="Test Worker",
            location={"type": "Point", "coordinates": [73.85, 18.52]},
            experienceYears=-1,
        )


def test_invalid_location_structure_rejected():
    with pytest.raises(ValidationError):
        GeoPoint(type="Point", coordinates=[200, 18.52])  # longitude out of range

    with pytest.raises(ValidationError):
        GeoPoint(type="Point", coordinates=[73.85])  # missing latitude
