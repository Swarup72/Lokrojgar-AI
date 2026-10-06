from abc import ABC, abstractmethod
from typing import Optional, Tuple


class STTProvider(ABC):
    """
    Provider-independent speech-to-text contract. `transcribe_audio()`
    (transcription.py) depends only on this interface, never on a specific
    provider - so the FastAPI route (app/api/voice.py) and Node never know
    or care whether Whisper or Sarvam actually produced the transcript.

    A provider's only job is to turn audio into text. It must NOT translate
    the speech and must NOT perform profile extraction - both stay the
    responsibility of app/extraction/extractor.py, called separately by the
    route after transcription completes.
    """

    @abstractmethod
    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: Optional[str],
        content_type: Optional[str],
        language: str,
    ) -> Tuple[str, Optional[float]]:
        """
        Transcribe `audio_bytes` and return (transcript, confidence).

        `language` is a PRIMARY LANGUAGE HINT ("mr"/"hi"/"en"/"auto"), never
        a strict constraint - implementations must not discard naturally
        code-switched words in other languages just because a hint was
        given (see WHISPER_LANGUAGE_HINT_BEHAVIOR in whisper_stt.py for the
        concrete Whisper-specific implementation of this rule).

        `confidence` is `None` when the provider has no real, comparable
        confidence signal for this transcription - never a fabricated
        number standing in for one.

        Raises:
            AiServiceUnavailableError: the provider itself isn't available
                (e.g. no API key configured, or a local model failed to load).
            SarvamProviderError: the provider responded with a real error
                that carries an HTTP-like status code (Sarvam-specific;
                local providers like Whisper have no equivalent and should
                raise ValueError instead for a bad request/bad audio).
            ValueError: the audio was empty, unreadable, or produced no
                transcript.
        """
        raise NotImplementedError
