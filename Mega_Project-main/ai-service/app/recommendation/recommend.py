from typing import Optional
from app.models.job import Job
from app.models.worker import WorkerProfile
from app.models.worker_skill import WorkerSkill
from app.ranking.config import RankingWeights
from app.recommendation.candidates import filter_open_jobs
from app.recommendation.models import PairMatchResult, RecommendationResult
from app.recommendation.pipeline import score_worker_job_pair


def _check_top_k(top_k: int) -> None:
    if top_k <= 0:
        raise ValueError(f"top_k must be a positive integer, got {top_k}.")


def recommend_jobs_for_worker(
    worker: WorkerProfile,
    worker_skills: list[WorkerSkill],
    jobs: list[Job],
    weights: Optional[RankingWeights] = None,
    top_k: int = 10,
) -> RecommendationResult:
    """
    Recommend the best-matching open jobs for one worker.

    This function computes no score itself: it filters eligible jobs
    (candidates.py), scores each remaining pair via the existing
    score_worker_job_pair() (pipeline.py, which in turn calls matching/
    and ranking/), drops pairs that couldn't be ranked at all
    (overall_score is None - never treated as 0), sorts, and truncates to
    top_k.

    worker_skills is passed through to score_worker_job_pair() unfiltered
    for every job - the pipeline already applies
    filter_worker_skills_by_worker() internally, so this function does not
    duplicate that filtering.
    """

    _check_top_k(top_k)

    eligible_jobs = filter_open_jobs(jobs)

    pair_results: list[PairMatchResult] = []
    for job in eligible_jobs:
        ranking_result = score_worker_job_pair(worker, worker_skills, job, weights)

        if ranking_result.overall_score is None:
            continue

        pair_results.append(
            PairMatchResult(
                worker_id=worker.worker_id,
                job_id=job.job_id,
                ranking=ranking_result,
            )
        )

    pair_results.sort(key=lambda pair: (-pair.ranking.overall_score, pair.job_id))

    return RecommendationResult(
        anchor_id=worker.worker_id,
        direction="worker_to_jobs",
        matches=pair_results[:top_k],
    )


def recommend_workers_for_job(
    job: Job,
    workers: list[WorkerProfile],
    worker_skills: list[WorkerSkill],
    weights: Optional[RankingWeights] = None,
    top_k: int = 10,
) -> RecommendationResult:
    """
    Recommend the best-matching workers for one job.

    No worker-side hard filter is applied: worker availability is already
    a scoring factor (Availability Matching), not an eligibility gate, so
    an "unavailable" worker is scored - and will likely rank low - rather
    than excluded outright.

    worker_skills may contain rows for many different workers; each call
    to score_worker_job_pair() filters it down to the current candidate
    via the pipeline's own filter_worker_skills_by_worker() - this
    function does not filter it itself.
    """

    _check_top_k(top_k)

    pair_results: list[PairMatchResult] = []
    for worker in workers:
        ranking_result = score_worker_job_pair(worker, worker_skills, job, weights)

        if ranking_result.overall_score is None:
            continue

        pair_results.append(
            PairMatchResult(
                worker_id=worker.worker_id,
                job_id=job.job_id,
                ranking=ranking_result,
            )
        )

    pair_results.sort(key=lambda pair: (-pair.ranking.overall_score, pair.worker_id))

    return RecommendationResult(
        anchor_id=job.job_id,
        direction="job_to_workers",
        matches=pair_results[:top_k],
    )
