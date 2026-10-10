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


# --- business name ----------------------------------------------------------

_MAX_BUSINESS_NAME_WORDS = 8
_BUSINESS_NAME_PUNCTUATION = set(" &'-./+#")

_BUSINESS_NAME_CARRIERS = [
    "माझ्या व्यवसायाचे नाव आहे", "माझ्या व्यवसायाचं नाव आहे",
    "माझ्या व्यवसायाचे नाव", "माझ्या व्यवसायाचं नाव",
    "माझ्या दुकानाचे नाव आहे", "माझ्या दुकानाचं नाव आहे",
    "माझ्या दुकानाचे नाव", "माझ्या दुकानाचं नाव",
    "माझ्या कंपनीचे नाव आहे", "माझ्या कंपनीचं नाव आहे",
    "माझ्या कंपनीचे नाव", "माझ्या कंपनीचं नाव",
    "माझा व्यवसाय आहे", "माझा व्यवसाय", "माझे व्यवसाय",
    "माझे दुकान आहे", "माझे दुकान", "माझं दुकान", "माझा दुकान",
    "माझी कंपनी आहे", "माझी कंपनी",
    "व्यवसायाचे नाव", "व्यवसायाचं नाव", "व्यवसाय", "दुकान", "कंपनी",
    "मेरे व्यवसाय का नाम है", "मेरे व्यवसाय का नाम",
    "मेरे व्यापार का नाम है", "मेरे व्यापार का नाम",
    "मेरी दुकान का नाम है", "मेरी दुकान का नाम",
    "मेरी कंपनी का नाम है", "मेरी कंपनी का नाम",
    "मेरा व्यवसाय है", "मेरा व्यवसाय", "मेरा व्यापार है", "मेरा व्यापार",
    "मेरी दुकान है", "मेरी दुकान", "मेरी कंपनी है", "मेरी कंपनी",
    "व्यवसाय का नाम", "दुकान का नाम", "कंपनी का नाम", "व्यवसाय", "व्यापार", "दुकान", "कंपनी",
    "my business name is", "my business is called", "my business's name is", "my business is",
    "my shop name is", "my shop is called", "my shop is",
    "my company name is", "my company is called", "my company is",
    "business name is", "shop name is", "company name is",
    "business name", "shop name", "company name", "business", "shop", "company",
]
_BUSINESS_NAME_TRAILERS = ["आहे", "हे", "है", "हूँ", "हूं", "नाव", "नाम", "name"]


def _looks_like_business_name(text: str) -> bool:
    """True when text contains letters and valid business name punctuation/digits."""
    if not text:
        return False
    if not any(unicodedata.category(ch).startswith("L") for ch in text):
        return False
    for ch in text:
        category = unicodedata.category(ch)
        if category.startswith("L") or category.startswith("M") or category.startswith("N") or ch in _BUSINESS_NAME_PUNCTUATION:
            continue
        return False
    return True


def extract_business_name(transcript: str) -> FieldExtractionResult:
    """
    The employer's business name, with carrier phrase removed.
    """
    result = FieldExtractionResult(field="businessName", transcript=transcript)
    candidate = _strip_carriers(transcript, _BUSINESS_NAME_CARRIERS, _BUSINESS_NAME_TRAILERS)

    if not candidate:
        result.reason = "no_speech"
        return result
    if not _looks_like_business_name(candidate):
        result.reason = "not_name_like"
        return result
    if len(candidate) < 2:
        result.reason = "too_short"
        return result
    if len(candidate.split()) > _MAX_BUSINESS_NAME_WORDS:
        result.reason = "too_many_words"
        return result

    result.value = candidate
    result.ok = True
    return result


# --- business type ----------------------------------------------------------

_MAX_BUSINESS_TYPE_WORDS = 10
_BUSINESS_TYPE_PUNCTUATION = set(" &'-./,")

_BUSINESS_TYPE_CARRIERS = [
    "आम्ही काम करतो", "आम्ही काम करते", "आमचे काम आहे", "आमचं काम आहे",
    "आमचा व्यवसाय आहे", "आमचा व्यवसाय", "आमचे काम", "आमचं काम",
    "कामाचे स्वरूप आहे", "कामाचे स्वरूप", "कामाचा प्रकार", "काम आहे",
    "हम काम करते हैं", "हम काम करते", "हमारा काम है", "हमारा व्यवसाय है",
    "हमारा काम", "हमारा व्यवसाय", "काम का प्रकार", "काम है",
    "we do work in", "we do work of", "our work is", "we provide", "we do",
    "type of work is", "type of business is", "work of", "business type is",
    "type of business", "business type", "work type", "kind of work",
]
_BUSINESS_TYPE_TRAILERS = ["आहे", "हे", "है", "करतो", "करते", "करते हैं", "हूँ", "हूं", "का", "चे", "चा", "ची"]


def _looks_like_business_type(text: str) -> bool:
    """True when text contains letters and valid business type punctuation/words."""
    if not text:
        return False
    if not any(unicodedata.category(ch).startswith("L") for ch in text):
        return False
    for ch in text:
        category = unicodedata.category(ch)
        if category.startswith("L") or category.startswith("M") or category.startswith("N") or ch in _BUSINESS_TYPE_PUNCTUATION:
            continue
        return False
    return True


def extract_business_type(transcript: str) -> FieldExtractionResult:
    """
    The employer's type of work or business, with carrier phrase removed.
    """
    result = FieldExtractionResult(field="businessType", transcript=transcript)
    candidate = _strip_carriers(transcript, _BUSINESS_TYPE_CARRIERS, _BUSINESS_TYPE_TRAILERS)

    if not candidate:
        result.reason = "no_speech"
        return result
    if not _looks_like_business_type(candidate):
        result.reason = "not_work_like"
        return result
    if len(candidate) < 2:
        result.reason = "too_short"
        return result
    if len(candidate.split()) > _MAX_BUSINESS_TYPE_WORDS:
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
    "businessName": extract_business_name,
    "businessType": extract_business_type,
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



# ===========================================================================
# Guided voice JOB POSTING fields
# ===========================================================================
#
# The employer-side counterpart to the worker fields above. Same contract and
# same guarantees: every value comes from something the transcript actually
# says, numbers come only from grounded_numbers() so the malformed-digit guard
# still applies, and anything unclear returns None with a reason so the wizard
# can ask again rather than publish a guess into a live job advert.
#
# These are deliberately separate functions from the worker ones even where the
# parsing is similar (pay, city). They report their own field name, which is
# what the draft is keyed by, and they carry job-specific bounds - a job's pay
# and a worker's expected pay are not the same quantity and should not share a
# range by accident.

# --- job title / work type --------------------------------------------------

_MAX_JOB_TITLE_WORDS = 12
_JOB_TITLE_PUNCTUATION = set(" &'-./,")

_JOB_TITLE_CARRIERS = [
    "मला कामासाठी माणसं पाहिजेत", "मला माणसं पाहिजेत", "मला कामगार पाहिजेत",
    "मला पाहिजे आहेत", "मला पाहिजेत", "मला पाहिजे", "मला हवेत", "मला हवा",
    "कामाचं नाव आहे", "कामाचे नाव आहे", "कामाचं नाव", "कामाचे नाव",
    "कामाचा प्रकार आहे", "कामाचा प्रकार", "काम आहे",
    "मुझे चाहिए हैं", "मुझे चाहिए", "मुझे काम के लिए", "मुझे लोग चाहिए",
    "काम का नाम है", "काम का नाम", "काम का प्रकार", "काम है",
    "i need", "i want", "i am looking for", "i'm looking for", "looking for",
    "we need", "we want", "the job is", "job title is", "work type is",
    "type of work is", "the work is", "required", "requirement is",
]
_JOB_TITLE_TRAILERS = [
    "पाहिजेत", "पाहिजे", "हवेत", "हवा", "आहे", "हे", "चाहिए", "है", "हैं",
    "साठी", "करिता", "के लिए", "का काम", "चं काम", "चे काम",
]


def _looks_like_job_text(text: str, punctuation: Set[str]) -> bool:
    """True when the text is words (letters/marks), optionally with digits."""
    if not text:
        return False
    if not any(unicodedata.category(ch).startswith("L") for ch in text):
        return False
    for ch in text:
        category = unicodedata.category(ch)
        if (
            category.startswith("L")
            or category.startswith("M")
            or category.startswith("N")
            or ch in punctuation
        ):
            continue
        return False
    return True


def extract_job_title(transcript: str) -> FieldExtractionResult:
    """
    The kind of work being advertised ("electrician", "वायरिंगचं काम").

    Carrier phrases here are requests rather than statements - an employer says
    "मला दोन इलेक्ट्रिशियन पाहिजेत", not "the job title is electrician" - so the
    carrier list is built around asking for workers.
    """
    result = FieldExtractionResult(field="jobTitle", transcript=transcript)
    candidate = _strip_carriers(transcript, _JOB_TITLE_CARRIERS, _JOB_TITLE_TRAILERS)

    if not candidate:
        result.reason = "no_speech"
        return result
    if not _looks_like_job_text(candidate, _JOB_TITLE_PUNCTUATION):
        result.reason = "not_work_like"
        return result
    if len(candidate) < 2:
        result.reason = "too_short"
        return result
    if len(candidate.split()) > _MAX_JOB_TITLE_WORDS:
        result.reason = "too_many_words"
        return result

    result.value = candidate
    result.ok = True
    return result


# --- job description --------------------------------------------------------

# A description is prose, so it is bounded generously and its carriers are only
# the lead-ins; the body is kept verbatim. Nothing is summarised or rephrased:
# whatever the employer said is what the advert will show them for review.
_MAX_JOB_DESCRIPTION_WORDS = 120
_JOB_DESCRIPTION_PUNCTUATION = set(" &'-./,()₹%:;")

_JOB_DESCRIPTION_CARRIERS = [
    "कामाचं वर्णन आहे", "कामाचे वर्णन आहे", "कामाचं वर्णन", "कामाचे वर्णन",
    "काम असं आहे", "काम असे आहे", "काय काम आहे",
    "काम का विवरण है", "काम का विवरण", "काम ऐसा है", "क्या काम है",
    "the work is", "work description is", "description is",
    "the job involves", "job involves", "work involves",
]
_JOB_DESCRIPTION_TRAILERS = ["आहे", "हे", "है", "हैं"]


def extract_job_description(transcript: str) -> FieldExtractionResult:
    """What the work actually involves, kept as spoken."""
    result = FieldExtractionResult(field="jobDescription", transcript=transcript)
    candidate = _strip_carriers(
        transcript, _JOB_DESCRIPTION_CARRIERS, _JOB_DESCRIPTION_TRAILERS
    )

    if not candidate:
        result.reason = "no_speech"
        return result
    if not _looks_like_job_text(candidate, _JOB_DESCRIPTION_PUNCTUATION):
        result.reason = "not_work_like"
        return result
    if len(candidate) < 2:
        result.reason = "too_short"
        return result
    if len(candidate.split()) > _MAX_JOB_DESCRIPTION_WORDS:
        result.reason = "too_many_words"
        return result

    result.value = candidate
    result.ok = True
    return result


# --- number of workers ------------------------------------------------------

# Job.requiredWorkers is `min: 1`. An employer hiring more than this many
# through one advert is outside what this flow is for, and a number that large
# is far more likely to be a wage that landed in the wrong step.
_MAX_REQUIRED_WORKERS = 99


def extract_job_worker_count(transcript: str) -> FieldExtractionResult:
    """
    How many workers are needed. Must be a whole number of people.

    A fractional answer is a mis-hearing, not a quantity of workers, so it is
    rejected rather than rounded - rounding would silently change the advert.
    """
    result = FieldExtractionResult(field="jobWorkerCount", transcript=transcript)
    found = grounded_numbers(transcript)

    if not found:
        result.reason = "no_number_found"
        return result

    whole = sorted(
        v for v in found if float(v).is_integer() and 1 <= v <= _MAX_REQUIRED_WORKERS
    )
    result.candidates = whole

    if not whole:
        result.reason = "out_of_range"
        return result
    if len(whole) > 1:
        # Two plausible counts in one sentence is genuinely ambiguous; the
        # employer is asked rather than one being picked for them.
        result.reason = "multiple_numbers"
        return result

    result.value = int(whole[0])
    result.ok = True
    return result


# --- job pay amount ---------------------------------------------------------


def extract_job_pay_amount(transcript: str) -> FieldExtractionResult:
    """
    The advertised amount. Mirrors extract_pay()'s reasoning, including the
    "दहा हजार" composite-number case, but reports the job field name.
    """
    result = FieldExtractionResult(field="jobPayAmount", transcript=transcript)
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


# --- job pay type -----------------------------------------------------------

# Job.payType is enum ["daily", "monthly", "fixed"]. These are the spoken forms
# of each, and nothing outside them resolves: an unrecognised frequency returns
# None so the employer picks it, because guessing "daily" on a monthly salary
# would advertise a wage thirty times too low.
_PAY_TYPE_WORDS = {
    "daily": [
        "रोजंदारी", "रोजनदारी", "रोजचे", "रोजच्या", "दररोज", "दिवसाला", "दिवसाचे",
        "प्रतिदिन", "रोज",
        "रोज़ाना", "रोजाना", "हर दिन", "दिन के", "दिहाड़ी", "दिहाडी", "रोज़", "प्रतिदिन",
        "per day", "a day", "each day", "every day", "daily", "day rate", "day wage",
        # Hinglish, and how Whisper renders an English "per day" spoken inside
        # a Devanagari-language recording. Observed end to end: "rupees per
        # day" came back as "रुपीज पर दे".
        "पर दे", "पर डे", "पर दिन", "प्रति दिन",
    ],
    "monthly": [
        "महिन्याला", "महिन्याचे", "दरमहा", "प्रतिमाह", "मासिक", "महिना",
        "महीने के", "हर महीने", "माहवार", "महीना",
        "per month", "a month", "each month", "every month", "monthly",
        "month salary", "salary per month",
        "पर मंथ", "प्रति माह", "पर महीना",
    ],
    "fixed": [
        "एकरकमी", "ठरलेली रक्कम", "ठरलेले", "ठोक", "संपूर्ण कामासाठी",
        "एकमुश्त", "ठेका", "पूरे काम का", "कुल",
        "fixed", "lump sum", "lumpsum", "one time", "total for the job",
        "for the whole job", "contract rate", "per job",
    ],
}


def extract_job_pay_type(transcript: str) -> FieldExtractionResult:
    """
    Whether the amount is per day, per month, or for the job as a whole.

    Matching is substring-based over a spoken-forms list rather than token
    based, because Marathi and Hindi attach the frequency to the noun
    ("महिन्याला", "दिवसाला") and tokenising would split those endings off.
    """
    result = FieldExtractionResult(field="jobPayType", transcript=transcript)
    text = transcript.lower()

    if not text.strip():
        result.reason = "no_speech"
        return result

    matched = {
        pay_type
        for pay_type, words in _PAY_TYPE_WORDS.items()
        if any(word.lower() in text for word in words)
    }

    if not matched:
        result.reason = "no_pay_type_found"
        return result
    if len(matched) > 1:
        # e.g. "रोज ८०० किंवा महिन्याला २०००० " - a real choice the employer
        # has to make, not something to resolve by precedence.
        result.reason = "multiple_pay_types"
        return result

    result.value = matched.pop()
    result.ok = True
    return result


# --- job city ---------------------------------------------------------------

_JOB_CITY_CARRIERS = [
    "काम आहे", "कामाचं ठिकाण आहे", "कामाचे ठिकाण आहे", "कामाचं ठिकाण", "कामाचे ठिकाण",
    "ठिकाण आहे", "ठिकाण", "जागा आहे", "इथे", "येथे",
    "काम है", "काम की जगह है", "काम की जगह", "जगह है", "जगह", "यहाँ", "यहां",
    # "काम" standalone: an employer says "काम कोल्हापूरमध्ये आहे", where the
    # carrier brackets the answer rather than preceding it contiguously.
    "काम",
    "the work is in", "work is in", "the job is in", "job is in",
    "located in", "location is", "place is", "site is", "in",
]
_JOB_CITY_TRAILERS = [
    "मध्ये", "मधे", "मध्येच", "में", "ला", "आहे", "हे", "है", "वर", "पाशी", "जवळ",
]

_MAX_JOB_CITY_WORDS = 5


def extract_job_city(transcript: str) -> FieldExtractionResult:
    """
    Where the work is. Never defaulted: an unrecognised answer stays empty so
    the employer types it, because a job advertised in the wrong town is worse
    than one with no town yet.
    """
    result = FieldExtractionResult(field="jobCity", transcript=transcript)
    candidate = _strip_carriers(transcript, _JOB_CITY_CARRIERS, _JOB_CITY_TRAILERS)

    if not candidate:
        result.reason = "no_speech"
        return result
    if not _looks_like_words(candidate):
        result.reason = "not_place_like"
        return result
    if len(candidate) < 2:
        result.reason = "too_short"
        return result
    if len(candidate.split()) > _MAX_JOB_CITY_WORDS:
        result.reason = "too_many_words"
        return result

    result.value = candidate
    result.ok = True
    return result


# Registered after definition so GUIDED_VOICE_FIELDS picks them up without the
# API layer needing its own list.
DETERMINISTIC_FIELDS.update(
    {
        "jobTitle": extract_job_title,
        "jobDescription": extract_job_description,
        "jobWorkerCount": extract_job_worker_count,
        "jobPayAmount": extract_job_pay_amount,
        "jobPayType": extract_job_pay_type,
        "jobCity": extract_job_city,
    }
)

# Fields whose mapping genuinely needs the language model. "skills" is the
# worker catalog step; "jobSkills" is its employer-side twin. Both resolve free
# multilingual speech onto the fixed Skill catalog, which is the one mapping
# deterministic parsing cannot do.
LLM_FIELDS = frozenset({"skills", "jobSkills"})
