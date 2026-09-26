from app.models.job import Job
from app.models.worker_skill import WorkerSkill


def extract_worker_skill_ids(
    worker_skills: list[WorkerSkill],
) -> list[str]:
    """
    Extract canonical skill IDs from WorkerSkill objects.

    The matching algorithm should work with skill IDs,
    while this function handles the actual project schema.
    """

    return [
        worker_skill.skill_id
        for worker_skill in worker_skills
    ]


def extract_job_skill_ids(job: Job) -> list[str]:
    """
    Extract canonical required skill IDs from a Job.
    """

    return job.skill_ids


def filter_worker_skills_by_worker(
    worker_skills: list[WorkerSkill],
    worker_id: str,
) -> list[WorkerSkill]:
    """
    Filter a bulk list of WorkerSkill rows down to the ones belonging to
    one specific worker, matched on WorkerSkill.worker_id.

    This is what lets a bulk load (e.g. every WorkerSkill row in the
    dataset) be narrowed to one worker before extract_worker_skill_ids()
    is called on it.
    """

    return [
        worker_skill
        for worker_skill in worker_skills
        if worker_skill.worker_id == worker_id
    ]