from pydantic import BaseModel


class SkillMatchResult(BaseModel):
    score: float
    matched_skills: list[str]
    missing_skills: list[str]


def calculate_skill_match(
    worker_skill_ids: list[str],
    job_skill_ids: list[str],
) -> SkillMatchResult:
    """
    Calculate skill compatibility between a worker and a job.

    The comparison is based on canonical skill IDs.

    Returns:
        SkillMatchResult containing:
        - score: 0 to 100
        - matched_skills
        - missing_skills
    """

    worker_skills = set(worker_skill_ids)
    required_skills = set(job_skill_ids)

    if not required_skills:
        return SkillMatchResult(
            score=0.0,
            matched_skills=[],
            missing_skills=[],
        )

    matched_skills = worker_skills.intersection(required_skills)
    missing_skills = required_skills - worker_skills

    score = (
        len(matched_skills)
        / len(required_skills)
    ) * 100

    return SkillMatchResult(
        score=score,
        matched_skills=sorted(matched_skills),
        missing_skills=sorted(missing_skills),
    )