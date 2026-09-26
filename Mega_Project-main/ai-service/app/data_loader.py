import json
from pathlib import Path

from app.models import Job, Rating, Skill, VoiceProfile, WorkerProfile, WorkerSkill

DATA_DIR = Path("data")


def _load_json(filename: str) -> list[dict]:
    file_path = DATA_DIR / filename

    with open(file_path, "r", encoding="utf-8") as file:
        return json.load(file)


def load_worker_profiles() -> list[WorkerProfile]:
    return [WorkerProfile(**row) for row in _load_json("worker_profiles.json")]


def load_worker_skills() -> list[WorkerSkill]:
    return [WorkerSkill(**row) for row in _load_json("worker_skills.json")]


def load_skills() -> list[Skill]:
    return [Skill(**row) for row in _load_json("skills.json")]


def load_jobs() -> list[Job]:
    return [Job(**row) for row in _load_json("jobs.json")]


def load_voice_profiles() -> list[VoiceProfile]:
    return [VoiceProfile(**row) for row in _load_json("voice_profiles.json")]


def load_ratings() -> list[Rating]:
    return [Rating(**row) for row in _load_json("ratings.json")]
