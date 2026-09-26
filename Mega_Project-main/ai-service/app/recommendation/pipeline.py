from typing import Optional

from app.matching.availability_features import extract_job_status, extract_worker_availability
from app.matching.availability_match import calculate_availability_match
from app.matching.location_features import (
    extract_job_location,
    extract_worker_location,
    extract_worker_preferred_radius_km,
)
from app.matching.location_match import calculate_location_match
from app.matching.pay_features import (
    extract_job_offered_pay,
    extract_job_pay_type,
    extract_worker_expected_pay,
)
from app.matching.pay_match import calculate_pay_match
from app.matching.rating_features import extract_worker_rating_avg
from app.matching.rating_match import calculate_rating_match
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
from app.matching.skill_features import (
    extract_job_skill_ids,
    extract_worker_skill_ids,
    filter_worker_skills_by_worker,
)
from app.matching.skill_match import calculate_skill_match
from app.models.job import Job
from app.models.worker import WorkerProfile
from app.models.worker_skill import WorkerSkill
from app.ranking.config import RankingWeights
from app.ranking.factors import build_match_factors
from app.ranking.rank import RankingResult, calculate_ranking


def score_worker_job_pair(
    worker: WorkerProfile,
    worker_skills: list[WorkerSkill],
    job: Job,
    weights: Optional[RankingWeights] = None,
) -> RankingResult:
    """
    Orchestrate the six existing matchers, MatchFactors, and ranking for
    one worker/job pair.

    This function contains no matching or ranking mathematics of its own -
    every score comes from calling the existing feature adapters and pure
    matchers exactly as they're already tested. It only answers "how do
    the existing pieces connect for one pair," not "how is any individual
    factor computed."

    worker_skills is expected to be a bulk list (e.g. every WorkerSkill row
    available) - it's filtered down to this worker's own rows here, using
    the same filter_worker_skills_by_worker adapter covered by its own
    tests.
    """

    this_worker_skills = filter_worker_skills_by_worker(worker_skills, worker.worker_id)
    skill_result = calculate_skill_match(
        extract_worker_skill_ids(this_worker_skills),
        extract_job_skill_ids(job),
    )

    location_result = calculate_location_match(
        extract_worker_location(worker),
        extract_job_location(job),
        extract_worker_preferred_radius_km(worker),
    )

    availability_result = calculate_availability_match(
        extract_worker_availability(worker),
        extract_job_status(job),
    )

    pay_result = calculate_pay_match(
        extract_worker_expected_pay(worker),
        extract_job_offered_pay(job),
        extract_job_pay_type(job),
    )

    rating_result = calculate_rating_match(
        extract_worker_rating_avg(worker),
    )

    relevance_result = calculate_relevance_match(
        extract_worker_preferred_categories(worker),
        extract_job_category_id(job),
        extract_worker_languages(worker),
        extract_job_preferred_languages(job),
        extract_job_original_language(job),
        extract_worker_experience_years(worker),
        extract_job_experience_required(job),
    )

    match_factors = build_match_factors(
        skill_result,
        location_result,
        availability_result,
        pay_result,
        rating_result,
        relevance_result,
    )

    return calculate_ranking(match_factors, weights)
