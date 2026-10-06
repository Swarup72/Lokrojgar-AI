#!/usr/bin/env python3
"""
Runs the CURRENT MLX Whisper provider over the labelled clips in
audio_manifest.json and reports, per field, whether the information
survived transcription.

Changes nothing: it calls transcribe_audio(), the same entry point
/voice/extract uses, so STT_PROVIDER / MLX_WHISPER_MODEL and every
decoding default stay exactly as production has them.

    PYTHONPATH=. .venv/bin/python evaluation/run_stt_eval.py
    PYTHONPATH=. .venv/bin/python evaluation/run_stt_eval.py --audio-dir /path/to/clips

Honesty rule enforced in code, not just in prose: clips whose source is
not "human" are reported separately and are NEVER aggregated into an
accuracy figure. Synthesized speech cannot stand in for a worker's voice,
so this script refuses to let it.
"""

import argparse
import json
import os
import sys
import unicodedata
from typing import Any, Dict, List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncio  # noqa: E402

from app.voice.transcription import transcribe_audio  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_AUDIO_DIR = os.path.join(HERE, "test_audio")
MANIFEST = os.path.join(HERE, "audio_manifest.json")
# "skills" is scored too: a garbled trade word is the same class of STT
# information loss as a garbled number, and it decides whether the worker
# gets any skill on their profile at all.
FIELDS = ["fullName", "experienceYears", "expectedPay", "city", "skills"]


def preserved(transcript: str, accepted_forms: List[str]) -> bool:
    """True if any accepted surface form survives in the transcript."""
    haystack = unicodedata.normalize("NFC", transcript).casefold()
    return any(unicodedata.normalize("NFC", form).casefold() in haystack for form in accepted_forms)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio-dir", default=DEFAULT_AUDIO_DIR)
    parser.add_argument("--out", default=os.path.join(HERE, "results", "stt_results.json"))
    args = parser.parse_args()

    with open(MANIFEST, encoding="utf-8") as handle:
        manifest = json.load(handle)

    provider = os.environ.get("STT_PROVIDER", "mlx_whisper")
    model = os.environ.get("MLX_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")
    print(f"provider={provider} model={model}", flush=True)

    rows: List[Dict[str, Any]] = []
    for clip in manifest["clips"]:
        path = clip["path"]
        if not os.path.isabs(path):
            path = os.path.join(args.audio_dir, path)
        if not os.path.exists(path):
            print(f"SKIP {clip['id']}: no file at {path}", flush=True)
            rows.append({"id": clip["id"], "source": clip["source"], "status": "missing_file", "path": path})
            continue

        with open(path, "rb") as handle:
            audio_bytes = handle.read()

        try:
            transcript, confidence = await transcribe_audio(
                audio_bytes=audio_bytes,
                filename=os.path.basename(path),
                content_type=None,
                language=clip["language"],
            )
            status = "ok"
            error = None
        except Exception as err:
            transcript, confidence, status, error = "", None, "error", f"{type(err).__name__}: {err}"

        checks = {
            field: preserved(transcript, forms)
            for field, forms in clip.get("expect", {}).items()
            if field in FIELDS
        }
        rows.append({
            "id": clip["id"],
            "source": clip["source"],
            "language": clip["language"],
            "status": status,
            "error": error,
            "intended_script": clip["intended_script"],
            "transcript": transcript,
            "confidence": confidence,
            "preserved": checks,
            "notes": clip.get("notes", ""),
        })
        flags = " ".join(f"{k}={'Y' if v else 'N'}" for k, v in checks.items())
        print(f"[{clip['source']}] {clip['id']}: {flags}", flush=True)
        print(f"    {transcript}", flush=True)

    human_rows = [r for r in rows if r.get("source") == "human" and r.get("status") == "ok"]
    other_rows = [r for r in rows if r.get("source") != "human"]

    accuracy: Dict[str, Any] = {}
    if human_rows:
        for field in FIELDS:
            scored = [r for r in human_rows if field in r["preserved"]]
            kept = [r for r in scored if r["preserved"][field]]
            accuracy[field] = {
                "preserved": len(kept),
                "total": len(scored),
                "rate": (len(kept) / len(scored)) if scored else None,
            }

    report = {
        "config": {"stt_provider": provider, "mlx_whisper_model": model},
        "human_clip_accuracy": accuracy,
        "human_clip_count": len(human_rows),
        "non_human_clip_count": len(other_rows),
        "rows": rows,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)

    print()
    if human_rows:
        print("=== STT accuracy (human-recorded clips only) ===")
        for field, stats in accuracy.items():
            rate = "n/a" if stats["rate"] is None else f"{stats['rate'] * 100:.1f}%"
            print(f"{field:16} {stats['preserved']:>3}/{stats['total']:<3} {rate}")
    else:
        print("=== NO STT ACCURACY REPORTED ===")
        print("No human-recorded labelled clip was available, so no accuracy figure is")
        print("produced. Results above from tts/unlabelled clips are a sanity check only:")
        print("synthesized speech has no accent, noise, disfluency or mic variation, so it")
        print("says nothing about how Whisper handles a real worker's recording.")
        print("See 'human_recordings_needed' in audio_manifest.json for how to fix this.")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    asyncio.run(main())
