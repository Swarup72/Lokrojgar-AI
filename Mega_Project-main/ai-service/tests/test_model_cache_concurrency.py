"""
H-6: concurrent first initialization of the local model caches.

Both caches used an unsynchronized check-then-load, and both are reached
from asyncio worker threads (asyncio.to_thread), so concurrent first
requests could each load their own copy of a multi-GB model. These tests
drive real threads through the real cache code with the heavy loader
replaced by a counting stub - no model is ever downloaded or loaded.
"""

import sys
import threading
import time
import types

import pytest

from app.extraction.local_llm_runtime import LocalLLMRuntime
from app.sarvam.errors import AiServiceUnavailableError
from app.voice import mlx_whisper_stt

THREADS = 8


def run_concurrently(fn, count=THREADS):
    """Start `count` threads that all call fn() at the same moment."""
    start = threading.Event()
    results, errors = [], []

    def worker():
        start.wait()
        try:
            results.append(fn())
        except Exception as exc:  # recorded, not raised, so every thread finishes
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(count)]
    for t in threads:
        t.start()
    start.set()
    for t in threads:
        t.join(timeout=30)
    return results, errors


# --- LocalLLMRuntime (Qwen) -------------------------------------------------


@pytest.fixture
def clean_llm_cache():
    saved = (LocalLLMRuntime._cached_model, LocalLLMRuntime._cached_tokenizer,
             LocalLLMRuntime._cached_model_name)
    LocalLLMRuntime._cached_model = None
    LocalLLMRuntime._cached_tokenizer = None
    LocalLLMRuntime._cached_model_name = None
    yield
    (LocalLLMRuntime._cached_model, LocalLLMRuntime._cached_tokenizer,
     LocalLLMRuntime._cached_model_name) = saved


@pytest.fixture
def fake_mlx_lm(monkeypatch):
    """Replace mlx_lm.load with a slow counting stub. Slow on purpose: an
    instant loader would hide the race this test exists to catch."""
    calls = []

    def fake_load(model_name):
        calls.append(model_name)
        time.sleep(0.15)
        tokenizer = types.SimpleNamespace(
            apply_chat_template=lambda *a, **k: "prompt", name=f"tokenizer::{model_name}"
        )
        return (f"model::{model_name}", tokenizer)

    module = types.ModuleType("mlx_lm")
    module.load = fake_load
    module.generate = lambda *a, **k: "{}"
    monkeypatch.setitem(sys.modules, "mlx_lm", module)
    return calls


def test_concurrent_first_llm_init_loads_exactly_once(clean_llm_cache, fake_mlx_lm):
    results, errors = run_concurrently(lambda: LocalLLMRuntime._load("model-a"))

    assert errors == []
    assert len(fake_mlx_lm) == 1, f"model loaded {len(fake_mlx_lm)} times, expected exactly 1"
    assert len(results) == THREADS
    # Every caller must get the same object, not a private copy.
    assert all(r[0] is results[0][0] for r in results)


def test_subsequent_llm_calls_reuse_the_cache(clean_llm_cache, fake_mlx_lm):
    first = LocalLLMRuntime._load("model-a")
    for _ in range(5):
        again = LocalLLMRuntime._load("model-a")
        assert again[0] is first[0]
    assert len(fake_mlx_lm) == 1


def test_different_llm_model_identities_do_not_share_a_cache_entry(clean_llm_cache, fake_mlx_lm):
    a = LocalLLMRuntime._load("model-a")
    b = LocalLLMRuntime._load("model-b")

    assert a[0] == "model::model-a"
    assert b[0] == "model::model-b"
    assert a[0] != b[0], "a different model name must never return the cached model"
    assert fake_mlx_lm == ["model-a", "model-b"]


def test_llm_init_failure_is_clean_and_does_not_poison_the_cache(clean_llm_cache, monkeypatch):
    attempts = []

    def failing_load(model_name):
        attempts.append(model_name)
        time.sleep(0.05)
        raise RuntimeError("weights not found")

    module = types.ModuleType("mlx_lm")
    module.load = failing_load
    monkeypatch.setitem(sys.modules, "mlx_lm", module)

    results, errors = run_concurrently(lambda: LocalLLMRuntime._load("model-a"))

    # Every waiting caller fails cleanly, with the documented error type.
    assert results == []
    assert len(errors) == THREADS
    assert all(isinstance(e, AiServiceUnavailableError) for e in errors)
    assert LocalLLMRuntime._cached_model is None, "a failed load must leave the cache empty"

    # The cache is not poisoned: once the loader works, a later call succeeds.
    module.load = lambda name: (f"model::{name}", f"tokenizer::{name}")
    recovered = LocalLLMRuntime._load("model-a")
    assert recovered[0] == "model::model-a"


def test_llm_inference_is_not_serialized_by_the_load_lock(clean_llm_cache, fake_mlx_lm, monkeypatch):
    """The load lock must be free while generate() runs, or warm inference
    would be single-file across the whole process."""
    monkeypatch.setenv("LOCAL_LLM_MODEL", "model-a")
    LocalLLMRuntime._load("model-a")  # warm the cache first
    observed = {}

    def fake_generate(model, tokenizer, prompt, max_tokens, verbose):
        # If the load lock were held around inference, this would fail.
        acquired = LocalLLMRuntime._load_lock.acquire(blocking=False)
        observed["lock_free_during_inference"] = acquired
        if acquired:
            LocalLLMRuntime._load_lock.release()
        return "{}"

    sys.modules["mlx_lm"].generate = fake_generate

    LocalLLMRuntime.generate("system", "user", 16)

    assert observed["lock_free_during_inference"] is True


def test_concurrent_warm_llm_inference_overlaps(clean_llm_cache, fake_mlx_lm, monkeypatch):
    """Warm inference from several threads must actually run at the same
    time, not queue behind one another."""
    monkeypatch.setenv("LOCAL_LLM_MODEL", "model-a")
    LocalLLMRuntime._load("model-a")
    inside = []
    peak = [0]
    lock = threading.Lock()

    def fake_generate(*a, **k):
        with lock:
            inside.append(1)
            peak[0] = max(peak[0], len(inside))
        time.sleep(0.2)
        with lock:
            inside.pop()
        return "{}"

    sys.modules["mlx_lm"].generate = fake_generate
    _, errors = run_concurrently(lambda: LocalLLMRuntime.generate("s", "u", 16), count=4)

    assert errors == []
    assert peak[0] > 1, f"inference was serialized: max concurrency {peak[0]}"


# --- MLX Whisper ------------------------------------------------------------


class FakeModelHolder:
    model = None
    model_path = None
    calls = []

    @classmethod
    def reset(cls):
        cls.model, cls.model_path, cls.calls = None, None, []

    @classmethod
    def get_model(cls, model_path, dtype):
        cls.calls.append((model_path, dtype))
        time.sleep(0.15)
        cls.model = f"whisper::{model_path}"
        cls.model_path = model_path
        return cls.model


@pytest.fixture
def fake_whisper(monkeypatch):
    FakeModelHolder.reset()
    transcribe_mod = types.ModuleType("mlx_whisper.transcribe")
    transcribe_mod.ModelHolder = FakeModelHolder
    whisper_mod = types.ModuleType("mlx_whisper")
    whisper_mod.transcribe = lambda *a, **k: {"text": "ok"}
    mx_mod = types.ModuleType("mlx.core")
    mx_mod.float16 = "float16"
    mx_pkg = types.ModuleType("mlx")
    mx_pkg.core = mx_mod
    monkeypatch.setitem(sys.modules, "mlx_whisper", whisper_mod)
    monkeypatch.setitem(sys.modules, "mlx_whisper.transcribe", transcribe_mod)
    monkeypatch.setitem(sys.modules, "mlx", mx_pkg)
    monkeypatch.setitem(sys.modules, "mlx.core", mx_mod)
    return FakeModelHolder


def test_concurrent_first_whisper_init_loads_exactly_once(fake_whisper):
    _, errors = run_concurrently(lambda: mlx_whisper_stt._ensure_model_cached("whisper-a"))

    assert errors == []
    assert len(fake_whisper.calls) == 1, f"loaded {len(fake_whisper.calls)} times, expected 1"


def test_subsequent_whisper_calls_reuse_the_cache(fake_whisper):
    for _ in range(5):
        mlx_whisper_stt._ensure_model_cached("whisper-a")
    assert len(fake_whisper.calls) == 1


def test_different_whisper_model_identities_reload(fake_whisper):
    mlx_whisper_stt._ensure_model_cached("whisper-a")
    mlx_whisper_stt._ensure_model_cached("whisper-b")

    assert [c[0] for c in fake_whisper.calls] == ["whisper-a", "whisper-b"]
    assert fake_whisper.model_path == "whisper-b"


def test_whisper_prewarm_uses_the_same_dtype_transcribe_would(fake_whisper):
    mlx_whisper_stt._ensure_model_cached("whisper-a")
    # transcribe() derives `mx.float16 if decode_options.get("fp16", True)`,
    # and this provider passes no fp16 override.
    assert fake_whisper.calls[0][1] == "float16"


def test_whisper_init_failure_does_not_poison_the_cache(monkeypatch):
    class FailingHolder:
        model = None
        model_path = None
        attempts = []

        @classmethod
        def get_model(cls, model_path, dtype):
            cls.attempts.append(model_path)
            raise RuntimeError("download failed")

    transcribe_mod = types.ModuleType("mlx_whisper.transcribe")
    transcribe_mod.ModelHolder = FailingHolder
    mx_mod = types.ModuleType("mlx.core")
    mx_mod.float16 = "float16"
    mx_pkg = types.ModuleType("mlx")
    mx_pkg.core = mx_mod
    monkeypatch.setitem(sys.modules, "mlx_whisper.transcribe", transcribe_mod)
    monkeypatch.setitem(sys.modules, "mlx", mx_pkg)
    monkeypatch.setitem(sys.modules, "mlx.core", mx_mod)

    with pytest.raises(RuntimeError):
        mlx_whisper_stt._ensure_model_cached("whisper-a")

    assert FailingHolder.model is None, "a failed load must leave the cache empty"

    # Retry works once the underlying problem is gone.
    FailingHolder.get_model = classmethod(
        lambda cls, path, dtype: setattr(cls, "model", "ok") or setattr(cls, "model_path", path)
    )
    mlx_whisper_stt._ensure_model_cached("whisper-a")
    assert FailingHolder.model == "ok"


def test_whisper_transcription_is_not_held_under_the_load_lock(fake_whisper):
    """Once warm, the load lock must be free during transcription."""
    mlx_whisper_stt._ensure_model_cached("whisper-a")
    observed = {}

    def fake_transcribe(*a, **k):
        acquired = mlx_whisper_stt._MODEL_LOAD_LOCK.acquire(blocking=False)
        observed["lock_free"] = acquired
        if acquired:
            mlx_whisper_stt._MODEL_LOAD_LOCK.release()
        return {"text": "hello"}

    sys.modules["mlx_whisper"].transcribe = fake_transcribe
    import os as _os
    monkeypatch_path = _os.path.join(_os.path.dirname(__file__), "dummy.wav")
    _os.environ["MLX_WHISPER_MODEL"] = "whisper-a"
    try:
        provider = mlx_whisper_stt.MLXWhisperSTT()
        text, confidence = provider._transcribe_sync(monkeypatch_path, "mr")
    finally:
        _os.environ.pop("MLX_WHISPER_MODEL", None)

    assert text == "hello"
    assert confidence is None
    assert observed["lock_free"] is True
