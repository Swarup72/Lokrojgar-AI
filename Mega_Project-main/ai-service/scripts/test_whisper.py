#!/usr/bin/env python3
"""
Manual, real-model test for the local Whisper STT provider - NOT part of
the automated pytest suite (that suite only ever mocks whisper.load_model,
per the project's rule that unit tests must never download a real model).

Usage:
    python scripts/test_whisper.py path/to/audio.wav [language]

`language` is optional (mr | hi | en); omit it to let Whisper auto-detect.

Reads the same WHISPER_MODEL / WHISPER_DEVICE / WHISPER_FP16 environment
variables the real app/voice/whisper_stt.py provider uses (via .env if
present), so this script exercises the exact same code path a real
/voice/extract request would when STT_PROVIDER=whisper - it does not
reimplement any loading/inference logic itself.

Never prints API keys or secrets - Whisper is a local model with no API
key at all, and this script doesn't touch Sarvam.
"""

import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from app.voice.whisper_stt import WhisperSTT, _resolve_device  # noqa: E402


async def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} path/to/audio.wav [language]")
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "auto"

    if not os.path.exists(audio_path):
        print(f"Error: file not found: {audio_path}")
        sys.exit(1)

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    model_name = os.environ.get("WHISPER_MODEL", "small")
    device = _resolve_device()

    print(f"Model: {model_name}")
    print(f"Device: {device}")
    print(f"Language hint: {language}")
    print(f"Audio file: {audio_path} ({len(audio_bytes)} bytes)")
    print("Loading model and transcribing (first run downloads the model if not cached)...")

    provider = WhisperSTT()
    t0 = time.time()
    try:
        transcript, confidence = await provider.transcribe(
            audio_bytes=audio_bytes,
            filename=os.path.basename(audio_path),
            content_type=None,
            language=language,
        )
    except Exception as error:
        print(f"FAILED: {type(error).__name__}: {error}")
        sys.exit(1)
    elapsed = time.time() - t0

    print()
    print(f"Elapsed: {elapsed:.1f}s")
    print(f"Confidence: {confidence!r} (Whisper has no comparable score - expected to be None)")
    print("Transcript:")
    print(transcript)


if __name__ == "__main__":
    asyncio.run(main())
