from app.models.job import Job


def _is_job_eligible(job: Job) -> bool:
    """
    Real backend2 status semantics (confirmed from job.controller.js /
    application.controller.js, not invented):

    - draft              -> not eligible (never actually reachable today,
                             but the schema allows it; createJob always
                             sets "open" immediately)
    - open               -> eligible
    - partially_assigned -> eligible ONLY if it still needs workers
                             (acceptOrRejectApplication sets this status
                             once filled_workers > 0 but < required_workers)
    - assigned           -> not eligible (filled_workers >= required_workers)
    - completed          -> not eligible
    - cancelled          -> not eligible
    - expired            -> not eligible (set by the deadline cron job)
    """

    if job.status == "open":
        return True

    if job.status == "partially_assigned":
        return job.filled_workers < job.required_workers

    return False


def filter_open_jobs(jobs: list[Job]) -> list[Job]:
    """
    Filter jobs down to the ones eligible to enter the scoring pipeline at
    all - this answers "should this candidate be scored," not "how well
    does it match."

    Kept this name (rather than renaming to something like
    filter_eligible_jobs) so app/recommendation/recommend.py - which is
    otherwise untouched - doesn't need any change here. "Open" is still
    the right mental model: a partially_assigned job that still needs
    workers is, functionally, still open to new applicants.

    Skill, location, availability, pay, rating, relevance, experience, and
    language are deliberately NOT filtered here - they're already handled
    by scoring in pipeline.py + matching/ + ranking/, and pre-filtering on
    them here would duplicate that system instead of just gating entry
    to it.

    Returns a new list (the input is never mutated) containing the same
    Job objects that passed the filter, in their original order.
    """

    return [job for job in jobs if _is_job_eligible(job)]
