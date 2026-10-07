"""
One MLX inference at a time.

WHY THIS EXISTS (measured, not assumed)
---------------------------------------
Model LOADING was already serialized - `_MODEL_LOAD_LOCK` in
voice/mlx_whisper_stt.py and `_load_lock` in extraction/local_llm_runtime.py -
but INFERENCE was not: every call goes through `asyncio.to_thread`, so N
concurrent requests started N concurrent MLX executions.

Measured on the 8GB M2 with three real recordings (warm model):

    sequential : total 10.22s, per call 3.52 / 3.41 / 3.28 s
    concurrent : total  8.88s, per call 8.61 / 8.85 / 8.40 s

Concurrency bought ~13% total throughput while making every individual call
~2.5x slower. MLX is already contending for one GPU, so running three at once
does not finish three jobs faster - it just interleaves them and inflates each
one's latency. Transcripts were identical and RSS was flat (503 MB), so the risk
is latency and contention rather than corruption or memory.

For the guided voice flow that trade is backwards: the worker waits on ONE short
step at a time, so per-call latency is the number that matters. Serializing turns
unpredictable interleaving into a predictable queue at effectively the same
throughput.

DELIBERATELY MINIMAL
--------------------
One shared semaphore with a limit of one, covering BOTH Whisper and Qwen,
because on this machine they contend for the same GPU and unified memory - a
per-model gate would still allow one of each to run together. No pooling, no
priorities, no queue metrics, no second model instance: those would be
speculative infrastructure for a problem that has not been shown to exist.

Model loading is NOT separately gated here. A load happens inside the same
to_thread call as the inference that triggered it, so it is already covered, and
holding the gate during a cold load is correct: nothing else should be running
inference while a ~4GB model is being paged in.
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# One at a time. Created lazily and bound to the running loop on first use, so
# importing this module never requires an event loop to exist yet.
_MAX_CONCURRENT_INFERENCES = 1

_gate: Optional[asyncio.Semaphore] = None
_gate_loop: Optional[asyncio.AbstractEventLoop] = None


def _get_gate() -> asyncio.Semaphore:
    """
    The process-wide gate for the currently running loop.

    Re-created if the loop changed - which happens in tests, where each
    asyncio.run() gets a fresh loop. A semaphore created on a dead loop would
    otherwise raise when awaited.
    """
    global _gate, _gate_loop

    loop = asyncio.get_running_loop()
    if _gate is None or _gate_loop is not loop:
        _gate = asyncio.Semaphore(_MAX_CONCURRENT_INFERENCES)
        _gate_loop = loop
    return _gate


async def run_exclusive(label: str, coro_factory):
    """
    Run one MLX inference, with at most one in flight across the process.

    `coro_factory` is a zero-argument callable returning the awaitable to run -
    a factory rather than an awaitable so nothing starts before the gate is
    actually held.

    The gate is released in a finally block, so a failed or cancelled inference
    can never strand it and wedge every later request.
    """
    gate = _get_gate()
    waiting = gate.locked()
    if waiting:
        logger.debug("MLX inference gate busy - %s is queued", label)
    await gate.acquire()
    try:
        return await coro_factory()
    finally:
        gate.release()


def inference_gate_is_held() -> bool:
    """Whether an inference is currently in flight. For tests and diagnostics."""
    return _gate is not None and _gate.locked()
