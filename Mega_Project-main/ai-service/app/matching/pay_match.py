from typing import Optional

from pydantic import BaseModel


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

    v1 limitation, driven by the actual schema, not a placeholder:
    WorkerProfile.expected_pay has no field declaring what unit/period it
    is denominated in, while Job always declares pay_type (daily/monthly/
    fixed). Without a worker-side unit, there is no way to confirm the two
    numbers share the same basis - treating them as directly comparable
    would silently assume an equivalence the schema does not support.

    So v1 never produces a numeric score: `comparable` is always False,
    and `score` is always None. Both raw values are still returned so a
    later recommendation explanation can show them side by side even
    though the system isn't claiming to have verified they're compatible.
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

    pay_type_note = f" '{job_pay_type}'" if job_pay_type else ""

    return PayMatchResult(
        score=None,
        comparable=False,
        worker_expected_pay=worker_expected_pay,
        job_offered_pay=job_offered_pay,
        job_pay_type=job_pay_type,
        reason=(
            "Worker's expected pay has no declared unit, so it cannot be "
            f"safely compared to a{pay_type_note} job pay amount."
        ),
    )
