#!/usr/bin/env python3
"""
Controlled 3-way STT experiment on the REAL labelled recordings.

Tests one variable: the shape of initial_prompt.
  A  none            - no prompt at all
  B  comma list      - the prompt currently in production
  C  prose           - same vocabulary, written as sentences, no commas

Why: a real session transcribed "700" as "2,7,7" inside a heavily
comma-fragmented transcript, and the production prompt is a comma-separated
vocabulary list. Whisper conditions on the prompt's punctuation style, so the
list may be teaching it to insert commas - including between digits.

EVALUATION ONLY. Does not touch app/voice/mlx_whisper_stt.py.
    PYTHONPATH=. .venv/bin/python evaluation/run_stt_prompt_style.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()
from evaluation.run_stt_eval import FIELDS, preserved  # same scoring as the baseline run

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, "test_audio")
MODEL = os.environ.get("MLX_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")

from app.voice.mlx_whisper_stt import MARATHI_DOMAIN_INITIAL_PROMPT as PROMPT_LIST

# Same domain vocabulary, as prose. No commas anywhere, and no worker's
# actual answers - only the kinds of words the audio contains.
PROMPT_PROSE = (
    "ही कामगार प्रोफाइलची नोंद आहे. कामगार स्वतःचे नाव सांगतो. "
    "तो किती वर्षांचा अनुभव आहे ते सांगतो. तो रोजचा पगार रुपयांमध्ये सांगतो "
    "जसे सातशे आठशे नऊशे किंवा दहा हजार. "
    "तो त्याचे काम सांगतो जसे इलेक्ट्रिशियन प्लंबिंग सुतारकाम रंगकाम."
)
CONFIGS = [("A none", None), ("B comma-list (production)", PROMPT_LIST), ("C prose", PROMPT_PROSE)]
LEAK = ["सातशे", "नऊशे", "प्लंबिंग", "सुतारकाम", "रंगकाम", "कामगार प्रोफाइल"]


def transcribe(path, language, prompt):
    import mlx_whisper
    kw = dict(path_or_hf_repo=MODEL, task="transcribe", language=language,
              word_timestamps=False, verbose=False)
    if prompt is not None:
        kw["initial_prompt"] = prompt
    t0 = time.time()
    r = mlx_whisper.transcribe(path, **kw)
    return (r.get("text") or "").strip(), time.time() - t0


def main():
    manifest = json.load(open(os.path.join(HERE, "audio_manifest.json"), encoding="utf-8"))
    clips = [c for c in manifest["clips"] if c["source"] == "human"
             and os.path.exists(os.path.join(AUDIO, c["path"]))]
    if not clips:
        print("No human-recorded clips available - nothing to measure.")
        return
    print(f"model={MODEL}  REAL human clips={len(clips)}\n")
    transcribe(os.path.join(AUDIO, clips[0]["path"]), "mr", None)  # warm

    results = {}
    for label, prompt in CONFIGS:
        rows, total = [], 0.0
        for c in clips:
            text, el = transcribe(os.path.join(AUDIO, c["path"]), c["language"], prompt)
            total += el
            rows.append({"id": c["id"], "text": text, "elapsed": el,
                         "preserved": {f: preserved(text, forms) for f, forms in c.get("expect", {}).items() if f in FIELDS},
                         "leaked": [w for w in LEAK if w in text]})
        results[label] = {"rows": rows, "avg": total / len(rows)}

    for label, _ in CONFIGS:
        d = results[label]
        ok = sum(1 for r in d["rows"] for v in r["preserved"].values() if v)
        tot = sum(len(r["preserved"]) for r in d["rows"])
        commas = sum(r["text"].count(",") for r in d["rows"])
        leaks = sum(len(r["leaked"]) for r in d["rows"])
        print(f"{label:28} fields {ok}/{tot}   commas {commas:>2}   leaked {leaks}   avg {d['avg']:.2f}s")
    print()
    for c in clips:
        print(f"### {c['id']}")
        for label, _ in CONFIGS:
            row = next(r for r in results[label]["rows"] if r["id"] == c["id"])
            flags = " ".join(f"{k}={'Y' if v else 'N'}" for k, v in row["preserved"].items())
            print(f"  {label:28} {flags}")
            print(f"  {'':28} {row['text']}")
        print()
    out = os.path.join(HERE, "results", "stt_prompt_style.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump({"model": MODEL, "prompts": {"list": PROMPT_LIST, "prose": PROMPT_PROSE},
               "results": results}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
