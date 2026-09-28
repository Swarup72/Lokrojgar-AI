from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.auth import verify_api_key
from app.models.job import Job
from app.models.worker import WorkerProfile
from app.models.worker_skill import WorkerSkill
from app.ranking.config import RankingWeights
from app.ranking.rank import RankingResult
from app.recommendation.explanations import MatchExplanation, explain_ranking_result
from app.recommendation.pipeline import score_worker_job_pair
from app.recommendation.recommend import recommend_jobs_for_worker, recommend_workers_for_job

router = APIRouter()


# --- Request models -----------------------------------------------------
# Thin wrappers around the existing domain models - no field is duplicated,
# each request body is just "the exact arguments score_worker_job_pair's
# callers already take," expressed as a Pydantic body.


class JobsForWorkerRequest(BaseModel):
    worker: WorkerProfile
    worker_skills: list[WorkerSkill] = Field(default_factory=list)
    jobs: list[Job]
    weights: Optional[RankingWeights] = None
    top_k: int = 10


class WorkersForJobRequest(BaseModel):
    job: Job
    workers: list[WorkerProfile]
    worker_skills: list[WorkerSkill] = Field(default_factory=list)
    weights: Optional[RankingWeights] = None
    top_k: int = 10


class ScorePairRequest(BaseModel):
    worker: WorkerProfile
    worker_skills: list[WorkerSkill] = Field(default_factory=list)
    job: Job
    weights: Optional[RankingWeights] = None


# --- Response models ------------------------------------------------------
# RecommendationResult/PairMatchResult (app/recommendation/models.py) are
# left untouched. These wrap them to additionally carry each match's
# MatchExplanation, without modifying the existing recommendation models.


class MatchWithExplanation(BaseModel):
    worker_id: str
    job_id: str
    ranking: RankingResult
    explanation: MatchExplanation


class RecommendationResponse(BaseModel):
    anchor_id: str
    direction: str
    matches: list[MatchWithExplanation]


def _attach_explanations(recommendation) -> RecommendationResponse:
    """
    Build the API response from an existing RecommendationResult, adding
    explain_ranking_result(pair.ranking) per match. No score is
    recalculated here - ranking is passed through exactly as produced by
    recommend_jobs_for_worker()/recommend_workers_for_job().
    """

    matches = [
        MatchWithExplanation(
            worker_id=pair.worker_id,
            job_id=pair.job_id,
            ranking=pair.ranking,
            explanation=explain_ranking_result(pair.ranking),
        )
        for pair in recommendation.matches
    ]

    return RecommendationResponse(
        anchor_id=recommendation.anchor_id,
        direction=recommendation.direction,
        matches=matches,
    )


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.post(
    "/recommendations/jobs-for-worker",
    response_model=RecommendationResponse,
    dependencies=[Depends(verify_api_key)],
)
def jobs_for_worker(request: JobsForWorkerRequest) -> RecommendationResponse:
    recommendation = recommend_jobs_for_worker(
        request.worker,
        request.worker_skills,
        request.jobs,
        request.weights,
        request.top_k,
    )
    return _attach_explanations(recommendation)


@router.post(
    "/recommendations/workers-for-job",
    response_model=RecommendationResponse,
    dependencies=[Depends(verify_api_key)],
)
def workers_for_job(request: WorkersForJobRequest) -> RecommendationResponse:
    recommendation = recommend_workers_for_job(
        request.job,
        request.workers,
        request.worker_skills,
        request.weights,
        request.top_k,
    )
    return _attach_explanations(recommendation)


@router.post(
    "/recommendations/score-pair",
    response_model=MatchWithExplanation,
    dependencies=[Depends(verify_api_key)],
)
def score_pair(request: ScorePairRequest) -> MatchWithExplanation:
    """
    Thin HTTP wrapper around the existing score_worker_job_pair() - not a
    new algorithm. Used by Node's applyForJob to score a single worker/job
    pair at application time, replacing the legacy JS matching engine for
    that one call site.
    """

    ranking = score_worker_job_pair(request.worker, request.worker_skills, request.job, request.weights)

    return MatchWithExplanation(
        worker_id=request.worker.worker_id,
        job_id=request.job.job_id,
        ranking=ranking,
        explanation=explain_ranking_result(ranking),
    )
