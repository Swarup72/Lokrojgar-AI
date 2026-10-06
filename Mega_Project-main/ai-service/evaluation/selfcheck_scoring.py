#!/usr/bin/env python3
"""
Self-check for the harness's own scoring rules. Runs in milliseconds and
loads no model: it only proves the comparator behaves as documented, so
the accuracy numbers it produces can be trusted.

    PYTHONPATH=. .venv/bin/python evaluation/selfcheck_scoring.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from evaluation.dataset import SKIP, ALL_CASES  # noqa: E402
from evaluation.scoring import (  # noqa: E402
    CORRECT, INVENTED, MISSING, SKILLS_EXTRA, SKILLS_MISSING, WRONG_TEXT, WRONG_VALUE,
    score_number, score_skills, score_text,
)

CHECKS = [
    # numbers: exact only
    ("pay 700 == 700", score_number(700, 700.0), (True, CORRECT)),
    ("pay 700 vs 7000 is a failure", score_number(700, 7000.0), (False, WRONG_VALUE)),
    ("pay 700 vs None is missing", score_number(700, None), (False, MISSING)),
    ("pay None vs 700 is invented", score_number(None, 700.0), (False, INVENTED)),
    ("pay None vs None is correct", score_number(None, None), (True, CORRECT)),
    ("experience 4 vs 4.0 is correct", score_number(4, 4.0), (True, CORRECT)),
    ("experience 4 vs 5 is a failure", score_number(4, 5.0), (False, WRONG_VALUE)),
    ("skipped field is not scored", score_number(SKIP, 123), (True, SKIP)),
    # text: accepted-forms list only, never fuzzy
    ("city accepted variant matches", score_text(["कोल्हापूर", "Kolhapur"], "कोल्हापूर"), (True, CORRECT)),
    ("city inflected form matches when listed", score_text(["पुणे", "पुण्यात"], "पुण्यात"), (True, CORRECT)),
    ("city case-insensitive for latin", score_text(["Pune"], "pune"), (True, CORRECT)),
    ("city trailing punctuation ignored", score_text(["पुणे"], "पुणे."), (True, CORRECT)),
    ("misheard city is a failure", score_text(["कोल्हापूर"], "कोलाबूर"), (False, WRONG_TEXT)),
    ("partial name is a failure", score_text(["स्वरूप समीर पाल"], "समीर पाल"), (False, WRONG_TEXT)),
    ("name null when expected null", score_text(None, None), (True, CORRECT)),
    ("name invented", score_text(None, "राहुल"), (False, INVENTED)),
    # skills: concept sets
    ("skill concept variant matches", score_skills([["plumbing", "प्लंबिंग"]], ["प्लंबिंग"]), (True, CORRECT)),
    ("skill missing", score_skills([["plumbing", "प्लंबिंग"]], []), (False, MISSING)),
    ("skill extra is flagged", score_skills([["plumbing", "प्लंबिंग"]], ["plumbing", "driving"]), (False, SKILLS_EXTRA)),
    ("two concepts both needed", score_skills([["wiring"], ["electrical"]], ["wiring"]), (False, SKILLS_MISSING)),
    ("skills null when expected null", score_skills(None, None), (True, CORRECT)),
    ("skills empty list counts as null", score_skills(None, []), (True, CORRECT)),
    ("skills invented", score_skills(None, ["plumbing"]), (False, INVENTED)),
]


def main() -> int:
    failures = 0
    for label, got, want in CHECKS:
        if got != want:
            print(f"FAIL {label}: got {got}, want {want}")
            failures += 1
        else:
            print(f"ok   {label}")

    ids = [c["id"] for c in ALL_CASES]
    if len(ids) != len(set(ids)):
        print("FAIL duplicate case ids")
        failures += 1
    for case in ALL_CASES:
        if not case["transcript"].strip():
            print(f"FAIL empty transcript in {case['id']}")
            failures += 1

    print(f"\n{len(CHECKS) - failures}/{len(CHECKS)} scoring checks passed over {len(ALL_CASES)} dataset cases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
