import os
import threading
from typing import Optional

from app.sarvam.errors import AiServiceUnavailableError

DEFAULT_LOCAL_LLM_MODEL = "mlx-community/Qwen3-4B-Instruct-2507-4bit"


class LocalLLMRuntime:
    """
    Shared, process-wide cached (model, tokenizer) for the local mlx-lm
    instruct model. Both profile extraction (local_llm_extractor.py) and
    semantic skill resolution (app/skills/semantic_resolver.py) need "a
    small local instruct model" - this loads it at most ONCE per process
    and lets every feature that needs one reuse the same ~4GB model,
    instead of each feature loading its own independent copy (which would
    double memory usage on an already memory-constrained 8GB machine).

    mlx_lm.load()/generate() are imported locally (not at module import
    time) so a machine without mlx-lm installed only fails when a local-LLM
    feature is actually used, not at FastAPI startup.
    """

    _cached_model = None
    _cached_tokenizer = None
    _cached_model_name: Optional[str] = None

    # Guards MODEL LOADING ONLY, never inference. generate() runs through
    # asyncio.to_thread, so several requests really do execute _load()
    # concurrently; without this the first few would each load their own
    # ~4GB copy of the model before any of them populated the cache, which
    # on an 8GB machine means swapping or an outright failure.
    _load_lock = threading.Lock()

    @classmethod
    def _cached_for(cls, model_name: str):
        """The cached pair for `model_name`, or None. Never returns another
        model's weights: a different LOCAL_LLM_MODEL is a cache miss."""
        if cls._cached_model is not None and cls._cached_model_name == model_name:
            return cls._cached_model, cls._cached_tokenizer
        return None

    @classmethod
    def _load(cls, model_name: str):
        # Fast path: once the model is cached, callers never touch the lock,
        # so warm inference is fully parallel.
        cached = cls._cached_for(model_name)
        if cached is not None:
            return cached

        with cls._load_lock:
            # Re-check inside the lock: whoever held it before us may have
            # already loaded exactly the model we want.
            cached = cls._cached_for(model_name)
            if cached is not None:
                return cached

            try:
                from mlx_lm import load
            except Exception as error:
                raise AiServiceUnavailableError(f"mlx-lm is not available: {error}") from error

            try:
                model, tokenizer = load(model_name)
            except Exception as error:
                # Nothing is cached on failure, so the cache is never left
                # holding a broken entry and a later request can retry.
                raise AiServiceUnavailableError(
                    f"Local LLM '{model_name}' failed to load: {error}"
                ) from error

            cls._cached_model = model
            cls._cached_tokenizer = tokenizer
            cls._cached_model_name = model_name
            return model, tokenizer

    @classmethod
    def generate(cls, system_prompt: str, user_content: str, max_tokens: int = 512) -> str:
        model_name = os.environ.get("LOCAL_LLM_MODEL", DEFAULT_LOCAL_LLM_MODEL)
        # _load() already guards the mlx_lm import with a clean
        # AiServiceUnavailableError - importing `generate` only after it
        # succeeds means an unavailable mlx_lm always surfaces that way,
        # never as a raw ModuleNotFoundError.
        model, tokenizer = cls._load(model_name)
        from mlx_lm import generate

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True, enable_thinking=False
        )

        try:
            return generate(model, tokenizer, prompt=prompt, max_tokens=max_tokens, verbose=False)
        except Exception as error:
            raise ValueError(f"Local LLM generation failed: {error}") from error
