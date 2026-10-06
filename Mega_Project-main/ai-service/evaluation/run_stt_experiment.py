#!/usr/bin/env python3
"""
Experiment A: does a Marathi employment-domain `initial_prompt` improve STT?

EVALUATION ONLY. This does not touch app/voice/mlx_whisper_stt.py. It
replicates that provider's exact mlx_whisper.transcribe() call and varies
ONE argument - initial_prompt - so any difference is attributable to it and
nothing else. Production stays on the baseline configuration unless the
result justifies changing it.

    PYTHONPATH=. .venv/bin/python evaluation/run_stt_experiment.py
"""

import json
import os
import sys
import time
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from evaluation.run_stt_eval import FIELDS, preserved  # noqa: E402  (same scoring as the baseline run)

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(HERE, "test_audio")
MANIFEST = os.path.join(HERE, "audio_manifest.json")
MODEL = os.environ.get("MLX_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")

# Vocabulary-style, not sentence-style, and deliberately NOT the test
# sentences: priming with the sentences themselves would let Whisper parrot
# them back and the experiment would measure nothing. It lists the amount
# and trade words the domain actually uses, including सातशे and नऊशे, which
# appear in NO test clip - if those start showing up in transcripts, the
# prompt is injecting words rather than improving recognition.
INITIAL_PROMPT = (
    "कामगार प्रोफाइल: नाव, अनुभव, पगार आणि कौशल्य. "
    "रक्कम: सातशे, आठशे, नऊशे, हजार, दहा हजार, पंधरा हजार रुपये रोज. "
    "कामे: इलेक्ट्रिशियन, प्लंबिंग, सुतारकाम, कारपेंट्री, पेंटिंग."
)

# Words that must never appear unless actually spoken - a parroting check.
LEAK_WORDS = ["सातशे", "नऊशे", "पंधरा हजार", "प्लंबिंग", "सुतारकाम", "कारपेंट्री", "पेंटिंग", "कामगार प्रोफाइल"]


def transcribe(audio_path: str, language: str, initial_prompt: Optional[str]) -> Dict:
    import mlx_whisper

    kwargs = dict(
        path_or_hf_repo=MODEL,
        task="transcribe",
        language=language,
        word_timestamps=False,
        verbose=False,
    )
    if initial_prompt is not None:
        kwargs["initial_prompt"] = initial_prompt

    started = time.time()
    result = mlx_whisper.transcribe(audio_path, **kwargs)
    elapsed = time.time() - started
    return {"text": (result.get("text") or "").strip(), "elapsed": elapsed}


def run_config(clips: List[Dict], initial_prompt: Optional[str]) -> List[Dict]:
    rows = []
    for clip in clips:
        path = os.path.join(AUDIO_DIR, clip["path"])
        out = transcribe(path, clip["language"], initial_prompt)
        checks = {f: preserved(out["text"], forms) for f, forms in clip.get("expect", {}).items() if f in FIELDS}
        leaks = [w for w in LEAK_WORDS if w in out["text"]]
        rows.append({
            "id": clip["id"], "transcript": out["text"], "elapsed": out["elapsed"],
            "preserved": checks, "leaked": leaks, "intended": clip["intended_script"],
        })
    return rows


def totals(rows: List[Dict]) -> Dict[str, str]:
    out = {}
    for field in FIELDS:
        scored = [r for r in rows if field in r["preserved"]]
        ok = [r for r in scored if r["preserved"][field]]
        out[field] = f"{len(ok)}/{len(scored)}" if scored else "n/a"
    allc = [(f, r) for r in rows for f in r["preserved"]]
    okc = [1 for f, r in allc if r["preserved"][f]]
    out["OVERALL"] = f"{len(okc)}/{len(allc)}"
    out["latency"] = f"{sum(r['elapsed'] for r in rows) / len(rows):.2f}s"
    return out


def main() -> None:
    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    clips = [c for c in manifest["clips"] if c["source"] == "human"
             and os.path.exists(os.path.join(AUDIO_DIR, c["path"]))]
    if not clips:
        print("No human clips found - nothing to compare.")
        return

    print(f"model={MODEL}  clips={len(clips)}")
    print(f"initial_prompt = {INITIAL_PROMPT!r}\n")

    # Warm the model so latency figures are steady-state, not first-load.
    transcribe(os.path.join(AUDIO_DIR, clips[0]["path"]), "mr", None)

    results = {}
    for label, prompt in (("baseline", None), ("initial_prompt", INITIAL_PROMPT)):
        # Twice, to confirm the comparison is not reading decoder noise.
        first = run_config(clips, prompt)
        second = run_config(clips, prompt)
        stable = all(a["transcript"] == b["transcript"] for a, b in zip(first, second))
        results[label] = {"rows": first, "deterministic": stable}
        print(f"{label}: deterministic across two runs = {stable}")

    print("\n" + "=" * 78)
    for clip in clips:
        b = next(r for r in results["baseline"]["rows"] if r["id"] == clip["id"])
        e = next(r for r in results["initial_prompt"]["rows"] if r["id"] == clip["id"])
        print(f"\n### {clip['id']}")
        print(f"  EXPECTED : {b['intended']}")
        print(f"  BASELINE : {b['transcript']}")
        print(f"  EXPERIMENT: {e['transcript']}")
        print(f"  fields  baseline={b['preserved']}")
        print(f"          experiment={e['preserved']}")
        if e["leaked"] or b["leaked"]:
            print(f"  LEAKED WORDS baseline={b['leaked']} experiment={e['leaked']}")

    tb, te = totals(results["baseline"]["rows"]), totals(results["initial_prompt"]["rows"])
    print("\n" + "=" * 78)
    print(f"{'metric':22}{'baseline':>14}{'initial_prompt':>18}")
    for key in list(FIELDS) + ["OVERALL", "latency"]:
        print(f"{key:22}{tb[key]:>14}{te[key]:>18}")

    out_path = os.path.join(HERE, "results", "stt_experiment_initial_prompt.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"model": MODEL, "initial_prompt": INITIAL_PROMPT,
                   "baseline": results["baseline"], "experiment": results["initial_prompt"],
                   "totals": {"baseline": tb, "initial_prompt": te}}, fh, ensure_ascii=False, indent=2)
    print(f"\nwrote {out_path}")


if __name__ == "__main__":
    main()
