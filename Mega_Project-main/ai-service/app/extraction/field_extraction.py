"""
Deterministic, per-field extraction for the guided voice flow.

The guided flow asks one question at a time, so each transcript has exactly one
semantic target. That removes the need for a language model on most fields: the
answer is either a number the transcript states (pay, experience) or the
transcript itself with its carrier phrase removed (name, city).

WHY NOT AN LLM HERE
-------------------
Measured on this machine with the real recordings: a warm Whisper call costs
~2.4-3.7s, while a warm Qwen extraction costs ~11-17s. Calling Qwen once per
step would make a seven-step wizard cost roughly 118s of compute against ~21s
for the single-recording flow. Deterministic parsing keeps a guided step at the
cost of its transcription alone.

Only the SKILLS step uses Qwen - exactly one call per guided session - because
mapping free-form multilingual speech onto a fixed catalog is the one genuinely
hard mapping here. That call reuses the existing extraction provider; nothing new
is added.

WHAT THIS MODULE WILL NOT DO
----------------------------
It never invents a value. Every function returns either a value the transcript
actually supports or `None` with a machine-readable reason, so the UI can ask the
worker to say it again. An empty field the worker can fill is recoverable; a
confident wrong value silently saved to their profile is not. Numbers come only
from grounded_numbers(), so the frozen malformed-digit guard ("2,7,7" is not 277)
applies here unchanged.
"""

import re
import unicodedata
from typing import List, Optional, Set

from pydantic import BaseModel

from app.extraction.number_grounding import grounded_numbers

# --- shared -----------------------------------------------------------------


class FieldExtractionResult(BaseModel):
    """
    One field's outcome.

    `value` is None whenever the transcript does not clearly state an answer.
    `candidates` carries the numbers that WERE found when more than one is
    plausible, so the UI can ask the worker which they meant instead of guessing
    for them.
    """

    field: str
    value: Optional[object] = None
    transcript: str = ""
    ok: bool = False
    reason: str = ""
    candidates: List[float] = []


# Carrier phrases - the words around an answer rather than the answer itself.
# Marathi, Hindi and English, longest first so "माझं नाव" is removed before "नाव".
_NAME_CARRIERS = [
    "माझं नाव आहे", "माझे नाव आहे", "माझं नाव", "माझे नाव", "माझा नाव",
    "मेरा नाम है", "मेरा नाम", "मेरी नाम",
    "my name is", "my name's", "i am", "i'm", "name is", "myself",
    "नाव", "नाम",
]
_NAME_TRAILERS = ["आहे", "हे", "है", "हूँ", "हूं"]

_CITY_CARRIERS = [
    "मी राहतो", "मी राहते", "माझं गाव", "माझे गाव", "मी", "गाव", "शहर",
    "मैं रहता हूँ", "मैं रहती हूँ", "मैं रहता", "मैं रहती", "मेरा गाँव", "गाँव", "शहर",
    "i live in", "i am from", "i'm from", "from", "live in", "city", "village",
]
_CITY_TRAILERS = ["मध्ये", "मधे", "में", "ला", "आहे", "हे", "है", "राहतो", "राहते", "रहता", "रहती", "हूँ", "हूं"]

# Punctuation that speech-to-text adds and that is never part of an answer.
_EDGE_PUNCTUATION = " \t\n।.,!?;:'\"()-–—"


def _strip_carriers(transcript: str, carriers: List[str], trailers: List[str]) -> str:
    """
    Remove the question's own words from a spoken answer.

    Case-insensitive for Latin script; Devanagari has no case so it is unaffected.
    Carriers are removed anywhere they appear (a worker may say "माझं नाव स्वरूप
    आहे" or just "स्वरूप"), trailers only at the end, where they are grammatical
    endings rather than part of a name or place.
    """
    text = transcript.strip()
    for carrier in sorted(carriers, key=len, reverse=True):
        text = re.sub(re.escape(carrier), " ", text, flags=re.IGNORECASE)

    text = " ".join(text.split()).strip(_EDGE_PUNCTUATION)

    # Trailers are stripped repeatedly: "पुण्यात आहे" ends with two of them.
    changed = True
    while changed:
        changed = False
        for trailer in sorted(trailers, key=len, reverse=True):
            if text.lower().endswith(trailer.lower()):
                text = text[: -len(trailer)].strip(_EDGE_PUNCTUATION)
                changed = True
    return " ".join(text.split()).strip(_EDGE_PUNCTUATION)


# --- name -------------------------------------------------------------------

# A name is words, not digits.
#
# Validated by Unicode CATEGORY rather than by a \w character class, because
# Python's \w does not match Devanagari vowel signs (category Mn) - the same trap
# number_grounding.py documents for its own tokenizer. With \w, every Marathi and
# Hindi name was rejected as "not name-like" while English ones passed, which is
# the opposite of what this product needs.
_MAX_NAME_WORDS = 6
_NAME_PUNCTUATION = set(" '-.")


def _looks_like_words(text: str) -> bool:
    """True when every character is a letter, a combining mark, or name punctuation."""
    if not text:
        return False
    if not any(unicodedata.category(ch).startswith("L") for ch in text):
        return False
    for ch in text:
        category = unicodedata.category(ch)
        if category.startswith("L") or category.startswith("M") or ch in _NAME_PUNCTUATION:
            continue
        return False
    return True


def extract_name(transcript: str) -> FieldExtractionResult:
    """
    The worker's name, which is the transcript minus the carrier phrase.

    Validated only for "does this look like a name at all" - never spell-checked
    or corrected against a list, because a real name is whatever the person says
    it is and this product serves people whose names are not in any dictionary.
    """
    result = FieldExtractionResult(field="fullName", transcript=transcript)
    candidate = _strip_carriers(transcript, _NAME_CARRIERS, _NAME_TRAILERS)

    if not candidate:
        result.reason = "no_speech"
        return result
    if any(character.isdigit() for character in candidate):
        result.reason = "contains_digits"
        return result
    if not _looks_like_words(candidate):
        result.reason = "not_name_like"
        return result
    if len(candidate) < 2:
        result.reason = "too_short"
        return result
    if len(candidate.split()) > _MAX_NAME_WORDS:
        # A whole sentence came through rather than a name.
        result.reason = "too_many_words"
        return result

    result.value = candidate
    result.ok = True
    return result


# --- pay --------------------------------------------------------------------

# Below this a "pay" answer is far more likely to be a misheard fragment than a
# real daily rate - but 0 is allowed explicitly, because the schema permits it
# and "I will discuss it" is a real answer a worker may give.
_MIN_MEANINGFUL_PAY = 10.0
_MAX_PAY = 10_000_000.0


def _plausible_pay(values: Set[float]) -> List[float]:
    return sorted(v for v in values if v == 0 or (_MIN_MEANINGFUL_PAY <= v <= _MAX_PAY))


def extract_pay(transcript: str) -> FieldExtractionResult:
    """
    Expected pay, taken only from numbers the transcript actually states.

    Every candidate comes from grounded_numbers(), so the frozen malformed-digit
    guard still applies: a transcript of "2,7,7" yields no numbers at all rather
    than 277. When several plausible amounts are present the field is left
    unresolved WITH its candidates, because picking one would be a guess - and in
    a pay field a wrong guess becomes the worker's advertised rate.
    """
    result = FieldExtractionResult(field="expectedPay", transcript=transcript)
    found = grounded_numbers(transcript)

    if not found:
        result.reason = "no_number_found"
        return result

    candidates = _plausible_pay(found)
    result.candidates = candidates

    if not candidates:
        result.reason = "no_plausible_amount"
        return result

    if len(candidates) > 1:
        # "दहा हजार" legitimately grounds as both 10 and 10000; the larger
        # reading is the amount in that construction, but only when the smaller
        # ones are its own components rather than separate amounts.
        largest = candidates[-1]
        if all(largest % c == 0 or c < _MIN_MEANINGFUL_PAY for c in candidates[:-1]):
            result.value = largest
            result.ok = True
            return result
        result.reason = "multiple_amounts"
        return result

    result.value = candidates[0]
    result.ok = True
    return result


# --- experience -------------------------------------------------------------

# A working life, generously bounded. Above this the number is something else
# the worker said - an age, a wage, a year.
_MAX_EXPERIENCE_YEARS = 60.0


def extract_experience(transcript: str) -> FieldExtractionResult:
    """
    Years of experience. 0 is a real, common answer (a first job) and is kept.
    """
    result = FieldExtractionResult(field="experienceYears", transcript=transcript)
    found = grounded_numbers(transcript)

    if not found:
        result.reason = "no_number_found"
        return result

    plausible = sorted(v for v in found if 0 <= v <= _MAX_EXPERIENCE_YEARS)
    result.candidates = plausible

    if not plausible:
        # Every number present is outside a working lifetime.
        result.reason = "out_of_range"
        return result

    if len(plausible) > 1:
        result.reason = "multiple_numbers"
        return result

    result.value = plausible[0]
    result.ok = True
    return result


# --- city -------------------------------------------------------------------

_MAX_CITY_WORDS = 5


def extract_city(transcript: str) -> FieldExtractionResult:
    """
    The place the worker named, with the carrier phrase removed.

    There is no gazetteer and deliberately no fallback: whatever place they said
    is kept as they said it, and the review screen is where they correct a
    misspelling. Substituting a default city is what previously made every worker
    look like they lived in Pune.
    """
    result = FieldExtractionResult(field="city", transcript=transcript)
    candidate = _strip_carriers(transcript, _CITY_CARRIERS, _CITY_TRAILERS)

    if not candidate:
        result.reason = "no_speech"
        return result
    if any(character.isdigit() for character in candidate):
        result.reason = "contains_digits"
        return result
    if not _looks_like_words(candidate):
        result.reason = "not_place_like"
        return result
    if len(candidate) < 2:
        result.reason = "too_short"
        return result
    if len(candidate.split()) > _MAX_CITY_WORDS:
        result.reason = "too_many_words"
        return result

    result.value = candidate
    result.ok = True
    return result


# --- dispatch ---------------------------------------------------------------

DETERMINISTIC_FIELDS = {
    "fullName": extract_name,
    "expectedPay": extract_pay,
    "experienceYears": extract_experience,
    "city": extract_city,
}


def extract_field(field: str, transcript: str) -> FieldExtractionResult:
    """
    Deterministic extraction for one guided field.

    "skills" is deliberately absent: it is the only field that needs the language
    model, and it is handled by the API layer so that the single Qwen call per
    guided session stays visible in one place.
    """
    extractor = DETERMINISTIC_FIELDS.get(field)
    if extractor is None:
        raise ValueError(f"No deterministic extractor for field {field!r}")
    return extractor(transcript)
