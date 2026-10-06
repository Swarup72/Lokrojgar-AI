import asyncio
import logging
import os
import tempfile
from typing import Optional, Tuple

from app.sarvam.errors import AiServiceUnavailableError
from app.voice.interface import STTProvider

logger = logging.getLogger(__name__)

# mr/hi/en are already Whisper's own language codes (confirmed via direct
# introspection of whisper.tokenizer.LANGUAGES) - no mapping table needed,
# unlike Sarvam's BCP-47-style mr-IN/hi-IN/en-IN.
_WHISPER_AUTO_DETECT = None


def _resolve_whisper_language(language: str) -> Optional[str]:
    if not language or language == "auto":
        return _WHISPER_AUTO_DETECT
    if language in ("mr", "hi", "en"):
        return language
    return _WHISPER_AUTO_DETECT


def _mps_available() -> bool:
    try:
        import torch

        return torch.backends.mps.is_available()
    except Exception:
        return False


def _resolve_device() -> str:
    requested = os.environ.get("WHISPER_DEVICE", "auto").lower()
    if requested == "cpu":
        return "cpu"
    if requested == "mps":
        return "mps" if _mps_available() else "cpu"
    # "auto" (default): prefer Apple Silicon MPS when it's genuinely
    # available, otherwise CPU - never fail just because MPS is absent.
    return "mps" if _mps_available() else "cpu"


class WhisperSTT(STTProvider):
    """
    Local, offline STT via openai-whisper - the default development
    provider for this migration. Produces a TRANSCRIPT only: task is always
    "transcribe", never "translate", so Marathi/Hindi speech (including
    naturally code-switched English words) is transcribed as spoken, not
    translated into English.

    The model is loaded lazily (first call to transcribe(), not at import
    time) and cached at class level, keyed by (model name, device) - so
    switching WHISPER_MODEL/WHISPER_DEVICE mid-process picks up a freshly
    loaded model, mirroring the fresh-env-read pattern already used by
    get_sarvam_client() elsewhere in this codebase, while normal repeated
    calls reuse the same in-memory model instead of reloading it from disk
    every request (loading is the slow part - seconds, not milliseconds).
    """

    _cached_model = None
    _cached_model_key: Optional[str] = None

    def _load_model(self, device: str):
        import whisper

        model_name = os.environ.get("WHISPER_MODEL", "small")
        key = f"{model_name}:{device}"

        if WhisperSTT._cached_model is not None and WhisperSTT._cached_model_key == key:
            return WhisperSTT._cached_model

        try:
            model = whisper.load_model(model_name, device=device)
        except Exception as error:
            raise AiServiceUnavailableError(
                f"Local Whisper model '{model_name}' failed to load: {error}"
            ) from error

        WhisperSTT._cached_model = model
        WhisperSTT._cached_model_key = key
        return model

    def _transcribe_sync(self, audio_path: str, language: Optional[str]) -> Tuple[str, Optional[float]]:
        device = _resolve_device()
        fp16 = os.environ.get("WHISPER_FP16", "false").lower() == "true"
        # Temporary experiment-only knob, default "true" preserves the
        # existing production default (whisper's own library default) -
        # added to evaluate whether disabling cross-window conditioning
        # reduces hallucination/repetition on code-switched audio. Not
        # documented in .env.example / README since it is not a supported
        # production setting yet, only an evaluation tool.
        condition_on_previous_text = (
            os.environ.get("WHISPER_CONDITION_ON_PREVIOUS_TEXT", "true").lower() == "true"
        )
        # Temporary experiment-only knob, default unset preserves whisper's
        # own default temperature-fallback schedule (beam_size/temperature
        # not passed at all). beam_size only takes effect at temperature==0
        # (confirmed in the installed whisper/transcribe.py: it is popped
        # from the decode kwargs for every temperature > 0 in the fallback
        # schedule) - so when an experiment sets this, temperature is
        # pinned to the single value 0 instead of the default schedule,
        # otherwise beam_size would silently stop applying after the first
        # fallback attempt.
        beam_size_env = os.environ.get("WHISPER_BEAM_SIZE")
        beam_size = int(beam_size_env) if beam_size_env else None
        extra_decode_kwargs = {"beam_size": beam_size, "temperature": 0} if beam_size is not None else {}
        model = self._load_model(device)

        try:
            result = model.transcribe(
                audio_path,
                language=language,
                task="transcribe",
                fp16=fp16,
                condition_on_previous_text=condition_on_previous_text,
                **extra_decode_kwargs,
            )
        except RuntimeError as error:
            if device != "cpu":
                # "Do not make the application fail simply because MPS is
                # unavailable" - if MPS errors out during actual inference
                # (not just at load time), fall back to CPU once and retry,
                # rather than failing the whole request.
                logger.warning("Whisper inference failed on device=%s (%s) - retrying on cpu", device, error)
                WhisperSTT._cached_model = None
                WhisperSTT._cached_model_key = None
                model = self._load_model("cpu")
                result = model.transcribe(
                    audio_path,
                    language=language,
                    task="transcribe",
                    fp16=False,
                    condition_on_previous_text=condition_on_previous_text,
                    **extra_decode_kwargs,
                )
            else:
                raise ValueError(f"Whisper could not process the provided audio: {error}") from error
        except Exception as error:
            raise ValueError(f"Whisper could not process the provided audio: {error}") from error

        transcript = (result.get("text") or "").strip()
        if not transcript:
            raise ValueError("Whisper returned an empty transcript.")

        # Whisper's transcribe() has no single comparable confidence score
        # the way Sarvam's language_probability is one (per-segment
        # avg_logprob/no_speech_prob aren't on the same 0-1 scale) - return
        # None honestly rather than fabricate a converted number.
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
            # whisper.transcribe() is a synchronous, CPU/GPU-bound call -
            # run it in a thread so it never blocks FastAPI's event loop.
            return await asyncio.to_thread(self._transcribe_sync, temp_path, whisper_language)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
