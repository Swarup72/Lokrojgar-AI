from abc import ABC, abstractmethod

from app.extraction.models import ExtractedProfile


class ExtractionProvider(ABC):
    """
    Provider-independent structured worker-profile extraction from a
    transcript - mirrors app/voice/interface.py's STTProvider so extraction
    can be swapped (Sarvam <-> local LLM) without app/api/voice.py or Node
    knowing which implementation produced the profile.

    Exception contract implementers must follow, and callers must handle:
    - AiServiceUnavailableError: provider not configured / model unavailable.
    - SarvamProviderError: a real upstream API error (Sarvam-backed
      providers only - never raised by a local provider).
    - ValueError: the provider ran but produced unusable output (empty
      transcript, malformed JSON, schema-invalid JSON). Never caught and
      papered over with a fabricated profile - the caller must propagate it.
    """

    @abstractmethod
    async def extract(self, transcript: str) -> ExtractedProfile:
        raise NotImplementedError
