"""
Field-by-field scoring rules for the voice evaluation harness.

Deliberately explicit and conservative:
- A number is correct only on an exact match. 7000 for 700 is a failure,
  not a partial credit.
- A text field is correct only if it matches one of the accepted surface
  forms written into the dataset label. Spelling variants are accepted
  only where the label says so, never inferred by fuzzy matching, so the
  score can't be inflated by a loose comparison.
- Every failure is classified, because "missing" (information lost),
  "invented" (a value the transcript never contained) and "wrong_value"
  (misread number) are three different defects with different fixes.

No single blended "accuracy score" is produced anywhere: a per-field
breakdown is the entire point of this harness.
"""

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from evaluation.dataset import SKIP

# Correct / failure classifications.
CORRECT = "correct"
MISSING = "missing"          # expected a value, extractor returned null
INVENTED = "invented"        # expected null, extractor returned a value
WRONG_VALUE = "wrong_value"  # both present, numbers differ
WRONG_TEXT = "wrong_text"    # both present, text outside the accepted forms
SKILLS_MISSING = "skills_missing"
SKILLS_EXTRA = "skills_extra"
SKILLS_WRONG = "skills_wrong"

_PUNCTUATION = "।.,!?;:\"'()-–—"


def normalize_text(value: str) -> str:
    """NFC + casefold + whitespace/punctuation trim. Never alters interior content."""
    text = unicodedata.normalize("NFC", str(value)).strip()
    text = re.sub(r"\s+", " ", text)
    text = text.strip(_PUNCTUATION).strip()
    return text.casefold()


def score_number(expected: Any, actual: Any) -> Tuple[bool, str]:
    if expected is SKIP:
        return True, SKIP
    if expected is None and actual is None:
        return True, CORRECT
    if expected is None:
        return False, INVENTED
    if actual is None:
        return False, MISSING
    return (True, CORRECT) if float(actual) == float(expected) else (False, WRONG_VALUE)


def score_text(expected: Any, actual: Any) -> Tuple[bool, str]:
    if expected is SKIP:
        return True, SKIP
    if expected is None and actual is None:
        return True, CORRECT
    if expected is None:
        return False, INVENTED
    if actual is None:
        return False, MISSING
    accepted = {normalize_text(form) for form in expected}
    return (True, CORRECT) if normalize_text(actual) in accepted else (False, WRONG_TEXT)


def score_skills(expected: Any, actual: Any) -> Tuple[bool, str]:
    """
    Concept-set comparison. Each expected concept is a list of accepted
    names for the same skill, so "plumbing" and "प्लंबिंग" are one concept.

    Correct means: every expected concept was found, and nothing was
    returned that maps to no expected concept (an unmatched extra skill is
    an invention, which matters for a platform that writes skills onto a
    worker's profile).
    """
    if expected is SKIP:
        return True, SKIP

    actual_list = actual or []
    if expected is None:
        return (True, CORRECT) if not actual_list else (False, INVENTED)
    if not actual_list:
        return False, MISSING

    matched_concepts = set()
    unmatched_actual = []
    for item in actual_list:
        normalized = normalize_text(item)
        hit = None
        for index, concept_forms in enumerate(expected):
            if normalized in {normalize_text(form) for form in concept_forms}:
                hit = index
                break
        if hit is None:
            unmatched_actual.append(item)
        else:
            matched_concepts.add(hit)

    missing_concepts = set(range(len(expected))) - matched_concepts
    if missing_concepts and unmatched_actual:
        return False, SKILLS_WRONG
    if missing_concepts:
        return False, SKILLS_MISSING
    if unmatched_actual:
        return False, SKILLS_EXTRA
    return True, CORRECT


FIELD_SCORERS = {
    "fullName": score_text,
    "experienceYears": score_number,
    "expectedPay": score_number,
    "city": score_text,
    "skills": score_skills,
}


def score_case(expected: Dict[str, Any], actual: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    results = {}
    for field, scorer in FIELD_SCORERS.items():
        exp = expected.get(field, SKIP)
        act = actual.get(field)
        ok, classification = scorer(exp, act)
        results[field] = {
            "expected": None if exp is SKIP else exp,
            "actual": act,
            "scored": classification != SKIP,
            "correct": ok,
            "classification": classification,
        }
    return results


def aggregate(scored_rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Per-field correct/total/accuracy, counting only scored fields."""
    summary: Dict[str, Dict[str, Any]] = {}
    for field in FIELD_SCORERS:
        total = sum(1 for row in scored_rows if row["fields"][field]["scored"])
        correct = sum(
            1 for row in scored_rows if row["fields"][field]["scored"] and row["fields"][field]["correct"]
        )
        summary[field] = {
            "correct": correct,
            "total": total,
            "accuracy": (correct / total) if total else None,
        }
    return summary


def failure_breakdown(scored_rows: List[Dict[str, Any]], field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for row in scored_rows:
        result = row["fields"][field]
        if result["scored"] and not result["correct"]:
            counts[result["classification"]] = counts.get(result["classification"], 0) + 1
    return counts
