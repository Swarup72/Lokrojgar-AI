"""
The MLX inference gate.

Model LOADING was already serialized; INFERENCE was not. Measured on the 8GB M2
with three real recordings (warm model):

    sequential : total 10.22s, per call 3.52 / 3.41 / 3.28 s
    concurrent : total  8.88s, per call 8.61 / 8.85 / 8.40 s

Concurrency bought ~13% total throughput while making every individual call
~2.5x slower - the wrong trade for a guided flow where a worker waits on one
short step at a time. These tests pin the gate's behaviour, not its timing.
"""

import asyncio

import pytest

from app.runtime.inference_gate import inference_gate_is_held, run_exclusive

# This suite has no pytest-asyncio and no other async test functions, so each
# test drives its own event loop with asyncio.run() rather than adding a plugin
# for one file. It also exercises the gate's loop re-binding on every test.


def test_inferences_do_not_overlap():
    async def _run():
        order = []

        async def job(name):
            order.append(f"start:{name}")
            await asyncio.sleep(0.02)
            order.append(f"end:{name}")
            return name

        results = await asyncio.gather(*[run_exclusive(f"j{n}", lambda n=n: job(n)) for n in range(4)])

        assert results == [0, 1, 2, 3]
        # Every start is immediately followed by its own end: nothing interleaved.
        for index in range(0, len(order), 2):
            assert order[index].startswith("start:")
            assert order[index + 1].startswith("end:")
            assert order[index].split(":")[1] == order[index + 1].split(":")[1]



    asyncio.run(_run())

def test_the_gate_is_released_after_a_successful_call():
    async def _run():
        await run_exclusive("ok", lambda: asyncio.sleep(0))
        assert inference_gate_is_held() is False



    asyncio.run(_run())

def test_a_failing_inference_still_releases_the_gate():
    async def _run():
        # Without the finally block, one failed transcription would wedge every
        # later request in the process.
        async def boom():
            raise RuntimeError("model blew up")

        with pytest.raises(RuntimeError):
            await run_exclusive("boom", boom)

        assert inference_gate_is_held() is False
        # And the next call still goes through.
        assert await run_exclusive("after", lambda: asyncio.sleep(0, result="fine")) == "fine"



    asyncio.run(_run())

def test_a_cancelled_inference_still_releases_the_gate():
    async def _run():
        async def slow():
            await asyncio.sleep(5)

        task = asyncio.create_task(run_exclusive("slow", slow))
        await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        assert inference_gate_is_held() is False



    asyncio.run(_run())

def test_the_gate_is_held_while_an_inference_runs():
    async def _run():
        held = []

        async def job():
            held.append(inference_gate_is_held())

        await run_exclusive("check", job)
        assert held == [True]



    asyncio.run(_run())

def test_the_gate_survives_a_new_event_loop():
    """
    Each asyncio.run() creates a fresh loop; a semaphore bound to a dead loop
    would raise when awaited, which would break every test after the first.
    Deliberately NOT wrapped in an outer loop - calling asyncio.run() twice is
    the thing being tested.
    """

    async def once():
        return await run_exclusive("loop", lambda: asyncio.sleep(0, result="ok"))

    assert asyncio.run(once()) == "ok"
    assert asyncio.run(once()) == "ok"

def test_both_models_share_one_gate():
    """
    Whisper and Qwen contend for the same GPU and unified memory on this machine,
    so a per-model gate would still let one of each run at once. This asserts
    they queue against each other.
    """
    async def _run():
        running = []
        peak = 0

        async def model_call(name):
            nonlocal peak
            running.append(name)
            peak = max(peak, len(running))
            await asyncio.sleep(0.02)
            running.remove(name)

        await asyncio.gather(
            run_exclusive("whisper.transcribe", lambda: model_call("whisper")),
            run_exclusive("qwen.extract_profile", lambda: model_call("qwen")),
            run_exclusive("qwen.resolve_skills", lambda: model_call("skills")),
        )

        assert peak == 1, "a Whisper call and a Qwen call must never run at the same time"


    asyncio.run(_run())
