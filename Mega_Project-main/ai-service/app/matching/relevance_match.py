from typing import Optional

from pydantic import BaseModel

# Equal weighting is an implementation convenience for v1, not a project
# requirement - pass a custom `signal_weights` dict to calculate_relevance_match
# to change the balance (e.g. once Ranking decides category matters more than
# experience). Revisit when Ranking is designed.
DEFAULT_SIGNAL_WEIGHTS: dict[str, float] = {
    "category": 1.0,
    "language": 1.0,
    "experience": 1.0,
}


class RelevanceMatchResult(BaseModel):
    score: float
    matched_signals: list[str]
    unmatched_signals: list[str]
    not_applicable_signals: list[str]
    reason: str


def calculate_relevance_match(
    worker_preferred_categories: list[str],
    job_category_id: str,
    worker_languages: list[str],
    job_preferred_languages: list[str],
    job_original_language: str,
    worker_experience_years: float,
    job_experience_required: float,
    signal_weights: Optional[dict[str, float]] = None,
) -> RelevanceMatchResult:
    """
    Calculate broader worker/job relevance from three signals that exist on
    BOTH sides of the actual schema: preferred category, language, and
    experience. Skill overlap is deliberately excluded - it's already
    Skill Matching's job, and recomputing it here would duplicate that
    component. Job type/shift compatibility is excluded too, for the same
    reason found in Availability Matching: WorkerProfile has no shift or
    job-type preference field to compare against Job.shift_type.

    Category is the only signal that can be "not applicable": a worker who
    hasn't stated any preferred_job_categories isn't expressing a mismatch,
    just no opinion, so it's excluded from the score rather than counted
    against them. Language and experience always have real values on both
    sides (schema defaults guarantee it), so they're always evaluated as
    either matched or unmatched.

    score = matched_weight / applicable_weight * 100, where "applicable"
    excludes not-applicable signals. Equal weighting by default (see
    DEFAULT_SIGNAL_WEIGHTS above).
    """

    weights = signal_weights or DEFAULT_SIGNAL_WEIGHTS

    matched_signals: list[str] = []
    unmatched_signals: list[str] = []
    not_applicable_signals: list[str] = []

    if worker_preferred_categories:
        if job_category_id in worker_preferred_categories:
            matched_signals.append("category")
        else:
            unmatched_signals.append("category")
    else:
        not_applicable_signals.append("category")

    language_targets = job_preferred_languages or [job_original_language]
    if any(language in worker_languages for language in language_targets):
        matched_signals.append("language")
    else:
        unmatched_signals.append("language")

    if worker_experience_years >= job_experience_required:
        matched_signals.append("experience")
    else:
        unmatched_signals.append("experience")

    applicable_signals = matched_signals + unmatched_signals
    applicable_weight = sum(weights[signal] for signal in applicable_signals)

    if applicable_weight == 0:
        score = 0.0
    else:
        matched_weight = sum(weights[signal] for signal in matched_signals)
        score = (matched_weight / applicable_weight) * 100

    reason_parts = []
    if matched_signals:
        reason_parts.append(f"matched: {', '.join(matched_signals)}")
    if unmatched_signals:
        reason_parts.append(f"unmatched: {', '.join(unmatched_signals)}")
    if not_applicable_signals:
        reason_parts.append(f"not applicable: {', '.join(not_applicable_signals)}")

    reason = "; ".join(reason_parts)

    return RelevanceMatchResult(
        score=score,
        matched_signals=matched_signals,
        unmatched_signals=unmatched_signals,
        not_applicable_signals=not_applicable_signals,
        reason=reason,
    )
