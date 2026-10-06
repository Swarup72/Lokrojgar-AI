# Voice pipeline evaluation harness

Measures the **existing** voice pipeline. It changes nothing: no prompt,
no model, no decoding setting, no schema, no `.env`. Every script calls
the same entry points `/voice/extract` calls, so whatever production is
configured to do right now is what gets measured.

Nothing here is imported by `app/`, and `pytest.ini` sets
`testpaths = tests`, so none of this is collected by the test suite.

## Why it exists

The accuracy diagnosis found two confirmed defects (pay lost in STT in one
real session; `सातशे रुपये रोज` → `7000` in extraction) but could not say
how *often* each stage fails. Changing a prompt or a decoding setting
without a baseline would be guesswork. This harness produces the baseline.

## Running it

From `ai-service/`:

```bash
# scoring rules self-check - no model, runs in milliseconds
PYTHONPATH=. .venv/bin/python evaluation/selfcheck_scoring.py

# extraction accuracy over all 41 labelled transcripts (~10 min, loads Qwen)
PYTHONPATH=. .venv/bin/python evaluation/run_extraction_eval.py

# just one slice
PYTHONPATH=. .venv/bin/python evaluation/run_extraction_eval.py --tag pay

# STT over labelled audio (reports accuracy ONLY for human recordings)
PYTHONPATH=. .venv/bin/python evaluation/run_stt_eval.py
```

Results are written to `evaluation/results/*.json`, including every raw
model output, so a run can be re-examined without re-running the model.

## Files

| File | Purpose |
|---|---|
| `dataset.py` | 41 labelled transcripts with known expected values |
| `scoring.py` | Per-field comparison rules and failure classification |
| `selfcheck_scoring.py` | Proves the comparator itself behaves as documented |
| `run_extraction_eval.py` | Qwen extraction accuracy over the dataset |
| `run_stt_eval.py` | Whisper accuracy over labelled audio |
| `audio_manifest.json` | Audio labels, and what is still needed for real STT evidence |
| `test_audio/` | Clip directory, split by language |

## How scoring works

- **Numbers** must match exactly. `7000` for `700` is a failure, never
  partial credit.
- **Text** (name, city) must match one of the accepted surface forms
  written into the label, so `कोल्हापूर` and `Kolhapur` both pass but
  `कोलाबूर` fails. Variants are accepted only where the label lists them;
  nothing is fuzzy-matched, so the score can't be quietly inflated.
- **Skills** are compared as concept sets, so `plumbing` and `प्लंबिंग`
  are the same skill. A skill that maps to no expected concept counts as
  an invention, because skills get written onto a real worker's profile.
- **`None` expected means the transcript never said it.** Returning any
  value there is an invention, not a near miss. 14 of the 41 cases carry
  at least one such grounding check.
- Every failure is classified `missing` / `invented` / `wrong_value` /
  `wrong_text` / `skills_*`, because those point at different fixes.
- **No blended score is ever produced.** A single "AI accuracy" number
  would hide exactly the per-field failures this exists to expose.

## The honesty rule about audio

`run_stt_eval.py` reports an accuracy figure **only** for clips marked
`source: "human"`. The two clips currently present are macOS `say`
output: no accent, no background noise, no disfluency, no microphone
variation. They are a sanity check that the STT path runs, nothing more,
and the script refuses to aggregate them.

Real STT accuracy needs human recordings. `audio_manifest.json` →
`human_recordings_needed` says exactly how to add them: record a person
reading one dataset transcript per clip, drop it in `test_audio/<lang>/`,
add an entry with `source: "human"`, re-run.
