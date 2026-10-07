import asyncio
import logging
import os
import tempfile
import threading
from typing import Optional, Tuple

from app.sarvam.errors import AiServiceUnavailableError
from app.voice.interface import STTProvider
from app.voice.whisper_stt import _resolve_whisper_language

from app.runtime.inference_gate import run_exclusive

logger = logging.getLogger(__name__)

DEFAULT_MLX_WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo"

# Generic domain context given to Whisper's decoder before every
# transcription. It names the kinds of words this app's audio contains -
# amounts and trades - and contains NO user-specific or answer-specific
# text, so it biases vocabulary without ever suggesting a particular
# profile's values.
#
# Measured on the 5 real Marathi recordings in evaluation/test_audio/mr:
# field accuracy 6/9 -> 7/9, with "इलेक्ट्रिशिंच" -> "इलेक्ट्रिशियन्च" and
# "अच्छे"/"आच्ची" -> "अठशे"/"आठशी" (recognisable as आठशे). No regression on
# names, experience or दहा हजार, and none of the prompt's own words
# (सातशे, नऊशे, प्लंबिंग, सुतारकाम) leaked into any transcript.
MARATHI_DOMAIN_INITIAL_PROMPT = (
    "कामगार प्रोफाइल: नाव, अनुभव, पगार आणि कौशल्य. "
    "रक्कम: सातशे, आठशे, नऊशे, हजार, दहा हजार, पंधरा हजार रुपये रोज. "
    "कामे: इलेक्ट्रिशियन, प्लंबिंग, सुतारकाम, कारपेंट्री, पेंटिंग."
)

# Guards MODEL LOADING ONLY, never transcription. mlx_whisper keeps its own
# process-wide cache (transcribe.ModelHolder) but reads and fills it with an
# unsynchronized check-then-load, and _transcribe_sync runs on asyncio worker
# threads - so concurrent first requests would each load their own copy of the
# model. Loading is serialized here; transcription itself stays parallel.
_MODEL_LOAD_LOCK = threading.Lock()


def _ensure_model_cached(model_name: str) -> None:
    """
    Populate mlx_whisper's own model cache for `model_name`, at most once
    even under concurrent first requests.

    The dtype mirrors exactly what mlx_whisper.transcribe() derives for the
    options this provider passes (it sends no fp16 override, and transcribe
    defaults fp16=True -> float16), so the entry pre-warmed here is the same
    one transcribe() would have created and it never reloads.
    """

    import mlx.core as mx
    from mlx_whisper.transcribe import ModelHolder

    dtype = mx.float16  # matches transcribe()'s `fp16` default

    # Fast path: already cached for this model, so no lock on the warm path.
    if ModelHolder.model is not None and ModelHolder.model_path == model_name:
        return

    with _MODEL_LOAD_LOCK:
        # Another thread may have loaded it while we waited.
        if ModelHolder.model is not None and ModelHolder.model_path == model_name:
            return
        # A failure here leaves ModelHolder untouched, so the cache is never
        # poisoned and a later request can retry the load.
        ModelHolder.get_model(model_name, dtype)


class MLXWhisperSTT(STTProvider):
    """
    Local, offline STT via Apple's MLX runtime (mlx-whisper) - Metal/ANE-
    accelerated Whisper inference on Apple Silicon. Always transcribes
    (task="transcribe", never "translate").

    The `language` argument is used as a PRIMARY LANGUAGE CONDITIONING hint,
    not a vocabulary restriction: a real Marathi voice test showed this
    model auto-detecting Gujarati instead of Marathi when no hint was
    given, so a recognized hint (mr/hi/en) is now always forwarded to
    mlx_whisper to anchor the primary language - Whisper's decoder can
    still transcribe embedded English technical terms (e.g. "plumber",
    "electrician") within an mr/hi-conditioned pass, since the hint only
    sets the primary decoding language, not a hard token restriction. An
    unrecognized/missing hint falls back to automatic detection. Reuses
    WhisperSTT's exact same resolution function (mr/hi/en are already
    Whisper's own native codes for both providers, and both must agree on
    resolution semantics) rather than duplicating it.

    mlx_whisper.transcribe() has its own internal model cache
    (mlx_whisper.transcribe.ModelHolder, keyed by path_or_hf_repo), so this
    class does not duplicate that caching - the first call loads the model,
    every later call in this process with the same MLX_WHISPER_MODEL value
    reuses it.
    """

    def _transcribe_sync(self, audio_path: str, language: Optional[str]) -> Tuple[str, Optional[float]]:
        try:
            import mlx_whisper
        except Exception as error:
            raise AiServiceUnavailableError(f"mlx-whisper is not available: {error}") from error

        model_name = os.environ.get("MLX_WHISPER_MODEL", DEFAULT_MLX_WHISPER_MODEL)

        try:
            # Serialized, and only while the model is not yet cached.
            _ensure_model_cached(model_name)

            # Unlocked: by now the model is warm, so concurrent requests
            # transcribe in parallel.
            result = mlx_whisper.transcribe(
                audio_path,
                path_or_hf_repo=model_name,
                task="transcribe",
                language=language,
                initial_prompt=MARATHI_DOMAIN_INITIAL_PROMPT,
                word_timestamps=False,
                verbose=False,
            )
        except Exception as error:
            raise ValueError(f"mlx-whisper could not process the provided audio: {error}") from error

        transcript = (result.get("text") or "").strip()
        if not transcript:
            raise ValueError("mlx-whisper returned an empty transcript.")

        # Same reasoning as WhisperSTT: no single comparable confidence
        # score is exposed - return None honestly rather than fabricate one.
        return transcript, None

    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: Optional[str],
        content_type: Optional[str],
        language: str,
    ) -> Tuple[str, Optional[float]]:
        if not audio_bytes:
            raise ValueError("Audio data is empty.")

        whisper_language = _resolve_whisper_language(language)
        suffix = os.path.splitext(filename or "")[1] or ".audio"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name

        try:
            # mlx_whisper.transcribe() is a synchronous, GPU(Metal)-bound
            # call - run it in a thread so it never blocks FastAPI's event
            # loop, exactly like WhisperSTT does for openai-whisper.
            #
            # Wrapped in the shared inference gate so at most one MLX inference
            # runs at a time. Measured: three concurrent transcriptions made
            # every individual call ~2.5x slower for ~13% more throughput, which
            # is the wrong trade for a flow where a worker waits on one short
            # step. The decoding call itself and every parameter to it are
            # unchanged - this only decides WHEN it is allowed to start.
            return await run_exclusive(
                "whisper.transcribe",
                lambda: asyncio.to_thread(self._transcribe_sync, temp_path, whisper_language),
            )
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
