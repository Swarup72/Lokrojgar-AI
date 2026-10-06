#!/usr/bin/env python3
"""
Runs the CURRENT production extraction path over the labelled dataset and
scores it per field. Changes nothing: it calls
extract_profile_from_transcript(), the exact entry point /voice/extract
uses, so the prompt, model, JSON parser and ExtractedProfile schema are
whatever production has configured right now.

Usage (from ai-service/):
    PYTHONPATH=. .venv/bin/python evaluation/run_extraction_eval.py
    PYTHONPATH=. .venv/bin/python evaluation/run_extraction_eval.py --tag pay
    PYTHONPATH=. .venv/bin/python evaluation/run_extraction_eval.py --out results.json

A schema rejection (what a real request would surface as HTTP 502) is
recorded as an error row, not swallowed - a case that cannot produce a
profile at all is a worse failure than a wrong field, and is reported as
such.
"""

import argparse
import asyncio
import json
import os
import sys
import time
from typing import Any, Dict, List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from evaluation.dataset import ALL_CASES, DETERMINISM_CASE_IDS, get_cases  # noqa: E402
from evaluation.scoring import aggregate, failure_breakdown, score_case  # noqa: E402

from app.extraction.extractor import extract_profile_from_transcript  # noqa: E402

SCORED_FIELDS = ["fullName", "experienceYears", "expectedPay", "city", "skills"]


async def run_one(transcript: str) -> Dict[str, Any]:
    started = time.time()
    try:
        profile = await extract_profile_from_transcript(transcript)
        return {
            "ok": True,
            "elapsed_s": round(time.time() - started, 1),
            "profile": profile.model_dump(by_alias=True),
            "error": None,
        }
    except Exception as error:  # reported, never repaired
        return {
            "ok": False,
            "elapsed_s": round(time.time() - started, 1),
            "profile": {},
            "error": f"{type(error).__name__}: {error}",
        }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", default=None, help="only run cases carrying this tag")
    parser.add_argument("--out", default="evaluation/results/extraction_results.json")
    parser.add_argument("--skip-determinism", action="store_true")
    parser.add_argument(
        "--rescore",
        default=None,
        metavar="RESULTS_JSON",
        help="re-score a previous run's saved raw outputs without calling the model "
             "(for correcting a dataset label - the model outputs are not re-generated)",
    )
    args = parser.parse_args()

    if args.rescore:
        with open(args.rescore, encoding="utf-8") as handle:
            previous = json.load(handle)
        by_id = {c["id"]: c for c in ALL_CASES}
        rescored = []
        for row in previous["rows"]:
            if row["id"] not in by_id:
                continue
            row = dict(row)
            row["fields"] = score_case(by_id[row["id"]]["expected"], row["raw_profile"])
            rescored.append(row)
        previous["rows"] = rescored
        previous["summary"] = aggregate(rescored)
        previous["failures_by_field"] = {f: failure_breakdown(rescored, f) for f in SCORED_FIELDS}
        previous["rescored"] = True
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(previous, handle, ensure_ascii=False, indent=2)
        print(f"re-scored {len(rescored)} saved rows (no model call)")
        for field, stats in previous["summary"].items():
            accuracy = "n/a" if stats["accuracy"] is None else f"{stats['accuracy'] * 100:.1f}%"
            print(f"{field:16} {stats['correct']:>3}/{stats['total']:<3} {accuracy}")
        print(f"\nwrote {args.out}")
        return

    cases = get_cases(args.tag)
    provider = os.environ.get("EXTRACTION_PROVIDER", "local_llm")
    model = os.environ.get("LOCAL_LLM_MODEL", "mlx-community/Qwen3-4B-Instruct-2507-4bit")
    print(f"provider={provider} model={model} cases={len(cases)}", flush=True)

    rows: List[Dict[str, Any]] = []
    for index, case in enumerate(cases, start=1):
        outcome = await run_one(case["transcript"])
        fields = score_case(case["expected"], outcome["profile"])
        row = {
            "id": case["id"],
            "language": case["language"],
            "tags": case["tags"],
            "transcript": case["transcript"],
            "notes": case["notes"],
            "ok": outcome["ok"],
            "error": outcome["error"],
            "elapsed_s": outcome["elapsed_s"],
            "raw_profile": outcome["profile"],
            "fields": fields,
        }
        rows.append(row)
        verdict = "ok " if all(f["correct"] for f in fields.values()) else "FAIL"
        print(
            f"[{index}/{len(cases)}] {verdict} {case['id']} ({outcome['elapsed_s']}s)"
            + ("" if outcome["ok"] else f"  ERROR {outcome['error']}"),
            flush=True,
        )

    determinism: List[Dict[str, Any]] = []
    if not args.skip_determinism and args.tag is None:
        print("re-running determinism checks...", flush=True)
        by_id = {c["id"]: c for c in ALL_CASES}
        first_by_id = {r["id"]: r["raw_profile"] for r in rows}
        for case_id in DETERMINISM_CASE_IDS:
            if case_id not in by_id or case_id not in first_by_id:
                continue
            second = await run_one(by_id[case_id]["transcript"])
            identical = second["profile"] == first_by_id[case_id]
            determinism.append({"id": case_id, "identical_on_rerun": identical})
            print(f"  {case_id}: identical_on_rerun={identical}", flush=True)

    report = {
        "config": {"extraction_provider": provider, "local_llm_model": model},
        "summary": aggregate(rows),
        "failures_by_field": {field: failure_breakdown(rows, field) for field in SCORED_FIELDS},
        "determinism": determinism,
        "rows": rows,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)

    print("\n=== per-field accuracy ===")
    for field, stats in report["summary"].items():
        accuracy = "n/a" if stats["accuracy"] is None else f"{stats['accuracy'] * 100:.1f}%"
        print(f"{field:16} {stats['correct']:>3}/{stats['total']:<3} {accuracy}")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    asyncio.run(main())
