"""
Pay compatibility calculation between worker expected pay and job offered pay.

Policy:
1. In LokRozgar AI, worker expectedPay is denominated as a daily wage (₹/day),
   as established across the worker profile form, translations, and voice prompts.
2. Job pay types supported:
   - "daily": directly comparable to worker daily expected pay.
   - "monthly": normalized to daily equivalent using 26 working days per month
     (standard industrial & statutory convention in Maharashtra / India).
   - "fixed": project/contract based compensation without declared duration.
     Cannot be directly compared to a daily wage without duration, so it is
     safely treated as non-comparable (score = None) per policy.
   - other / missing: non-comparable (score = None).
3. Score scale (0 - 100):
   - If offered >= expected: 100.0 (job meets or exceeds worker expectation).
   - If 0.5 <= (offered / expected) < 1.0: proportional match score:
     round((offered / expected) * 100.0, 1).
   - If (offered / expected) < 0.5: 0.0 (severely below expectation, < 50%).
4. When either pay value is missing or <= 0:
   - score = None, comparable = False (excluded from ranking weighted average).
"""

from typing import Optional

from pydantic import BaseModel

WORKING_DAYS_PER_MONTH = 26.0


class PayMatchResult(BaseModel):
    score: Optional[float]
    comparable: bool
    worker_expected_pay: Optional[float]
    job_offered_pay: Optional[float]
    job_pay_type: Optional[str]
    reason: str


def calculate_pay_match(
    worker_expected_pay: Optional[float],
    job_offered_pay: Optional[float],
    job_pay_type: Optional[str] = None,
) -> PayMatchResult:
    """
    Calculate pay compatibility between a worker's expected pay and a
    job's offered pay.
    """

    if worker_expected_pay is None or job_offered_pay is None:
        missing = []
        if worker_expected_pay is None:
            missing.append("worker expected pay")
        if job_offered_pay is None:
            missing.append("job offered pay")

        return PayMatchResult(
            score=None,
            comparable=False,
            worker_expected_pay=worker_expected_pay,
            job_offered_pay=job_offered_pay,
            job_pay_type=job_pay_type,
            reason=f"Missing data: {' and '.join(missing)}.",
        )

    if worker_expected_pay <= 0 or job_offered_pay <= 0:
        return PayMatchResult(
            score=None,
            comparable=False,
            worker_expected_pay=worker_expected_pay,
            job_offered_pay=job_offered_pay,
            job_pay_type=job_pay_type,
            reason="Pay values must be greater than zero.",
        )

    norm_pay_type = (job_pay_type or "").strip().lower()

    if not norm_pay_type:
        return PayMatchResult(
            score=None,
            comparable=False,
            worker_expected_pay=worker_expected_pay,
            job_offered_pay=job_offered_pay,
            job_pay_type=job_pay_type,
            reason="Job pay type is missing, so pay comparison cannot be performed.",
        )

    if norm_pay_type == "fixed":
        return PayMatchResult(
            score=None,
            comparable=False,
            worker_expected_pay=worker_expected_pay,
            job_offered_pay=job_offered_pay,
            job_pay_type=job_pay_type,
            reason=(
                "Fixed-contract compensation cannot be directly converted to "
                "a daily expected wage without project duration."
            ),
        )

    if norm_pay_type == "daily":
        normalized_job_daily = float(job_offered_pay)
    elif norm_pay_type == "monthly":
        normalized_job_daily = float(job_offered_pay) / WORKING_DAYS_PER_MONTH
    else:
        return PayMatchResult(
            score=None,
            comparable=False,
            worker_expected_pay=worker_expected_pay,
            job_offered_pay=job_offered_pay,
            job_pay_type=job_pay_type,
            reason=f"Unsupported pay type '{job_pay_type}' cannot be normalized for comparison.",
        )

    # Calculate compatibility score
    worker_daily = float(worker_expected_pay)

    if normalized_job_daily >= worker_daily:
        score = 100.0
        reason = (
            f"Offered pay (₹{normalized_job_daily:.0f}/day) meets or exceeds "
            f"worker expected pay (₹{worker_daily:.0f}/day)."
        )
    else:
        ratio = normalized_job_daily / worker_daily
        if ratio >= 0.5:
            score = round(ratio * 100.0, 1)
            reason = (
                f"Offered pay (₹{normalized_job_daily:.0f}/day) is {ratio * 100.0:.1f}% "
                f"of worker expected pay (₹{worker_daily:.0f}/day)."
            )
        else:
            score = 0.0
            reason = (
                f"Offered pay (₹{normalized_job_daily:.0f}/day) is significantly below "
                f"worker expected pay (₹{worker_daily:.0f}/day) (< 50%)."
            )

    return PayMatchResult(
        score=score,
        comparable=True,
        worker_expected_pay=worker_expected_pay,
        job_offered_pay=job_offered_pay,
        job_pay_type=job_pay_type,
        reason=reason,
    )
