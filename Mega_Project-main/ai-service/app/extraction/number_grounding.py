"""
Deterministic check that a number the LLM returned is actually present in
the transcript.

Why this exists: on a clean transcript the extractor converts Marathi,
Hindi and English number words correctly (measured: every tested form of
सातशे/आठशे/दहा हजार/पंधरा हजार/आठ सौ/eight hundred). But when speech-to-text
garbles the audio, the model has been observed to answer with a number the
transcript never contained - a real session transcribed as
"...आच्छे रूपे एट हंडेट रूपीज..." (eight hundred, twice) produced
expectedPay = 10000, which was then shown to the worker as their rate.

A wrong number silently written onto a worker's profile is worse than an
empty field the worker fills in themselves, so a value that cannot be
traced back to the transcript is dropped rather than trusted. This never
invents or repairs a value: it only ever keeps what the model said, or
replaces it with None.

Deliberately conservative - a number is grounded if ANY reading of the
transcript yields it (digits, Devanagari digits, or a number-word phrase),
so an unusual-but-real phrasing is kept rather than discarded.
"""

import re
import unicodedata
from typing import Optional, Set

# Single tokens that carry a complete value.
_UNITS = {
    # Marathi
    "शून्य": 0, "एक": 1, "दोन": 2, "तीन": 3, "चार": 4, "पाच": 5, "सहा": 6,
    "सात": 7, "आठ": 8, "नऊ": 9, "दहा": 10, "अकरा": 11, "बारा": 12, "तेरा": 13,
    "चौदा": 14, "पंधरा": 15, "सोळा": 16, "सतरा": 17, "अठरा": 18, "एकोणीस": 19,
    "वीस": 20, "पंचवीस": 25, "तीस": 30, "चाळीस": 40, "पन्नास": 50, "साठ": 60,
    "सत्तर": 70, "ऐंशी": 80, "नव्वद": 90,
    # Hindi
    "दो": 2, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "नौ": 9, "दस": 10,
    "ग्यारह": 11, "बारह": 12, "तेरह": 13, "चौदह": 14, "पंद्रह": 15, "सोलह": 16,
    "सत्रह": 17, "अठारह": 18, "उन्नीस": 19, "बीस": 20, "पच्चीस": 25, "तीस_hi": 30,
    "चालीस": 40, "पचास": 50, "साठ_hi": 60, "सत्तर_hi": 70, "अस्सी": 80, "नब्बे": 90,
    # English
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
    "eighty": 80, "ninety": 90,
}

# Marathi contracts "<unit> hundred" into one word (सातशे = 700); Hindi and
# English keep them separate (सात सौ / seven hundred), handled by _MULTIPLIERS.
_CONTRACTED_HUNDREDS = {
    "शंभर": 100, "दोनशे": 200, "तीनशे": 300, "चारशे": 400, "पाचशे": 500,
    "सहाशे": 600, "सातशे": 700, "आठशे": 800, "नऊशे": 900,
}

_MULTIPLIERS = {
    "शे": 100, "सौ": 100, "hundred": 100,
    "हजार": 1000, "thousand": 1000,
    "लाख": 100_000, "lakh": 100_000, "lac": 100_000,
}

# Speech-to-text corruptions of a number word, each observed in a real
# recording in evaluation/test_audio/mr. They are NOT valid Marathi words,
# so they are admitted only next to a money word (see _PAY_CONTEXT): on its
# own "आठशी" is not evidence that anyone named an amount. Keep this list
# short and tied to observed evidence - it is not a place for guesses.
_PAY_CONTEXT_VARIANTS = {
    "अठशे": 800.0,   # 02-pay-800.wav, 05-full-profile.wav
    "आठशी": 800.0,   # 05-full-profile.wav
}

# Money/rate words, including the spellings Whisper actually produces
# (रुपे / रूपे / रुपय / रूपीज alongside the correct रुपये).
_PAY_CONTEXT = {
    "रुपये", "रुपय", "रुपे", "रूपे", "रूपये", "रुपीज", "रूपीज", "रुपया",
    "rupees", "rupee", "rs", "पगार", "मजुरी", "दर", "रोज", "दिवसाला", "daily",
    "सैलरी", "salary",
}

# How far from the variant a money word may sit and still count as context.
_PAY_CONTEXT_WINDOW = 3

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    return text.translate(_DEVANAGARI_DIGITS).lower()


def _is_valid_digit_grouping(raw: str) -> bool:
    """
    True when a comma-separated digit string is grouped the way written
    numbers actually are: a leading group of 1-3 digits, then groups of
    exactly 2 or 3 (covers both 15,000 and the Indian 1,50,000).

    "2,7,7" fails - single-digit groups are a transcription artifact, not a
    number.
    """
    integer_part = raw.split(".")[0]
    groups = integer_part.split(",")
    if len(groups) < 2:
        return True
    if not 1 <= len(groups[0]) <= 3:
        return False
    return all(len(group) in (2, 3) for group in groups[1:])

def grounded_numbers(transcript: str) -> Set[float]:
    """Every numeric value the transcript can be read as stating."""
    text = _normalize(transcript)
    found: Set[float] = set()

    # Digit forms, including grouped ones such as 15,000 and 1,50,000.
    for raw in re.findall(r"\d[\d,]*(?:\.\d+)?", text):
        # A TRAILING comma is sentence punctuation, not digit grouping -
        # grouping requires digits after the comma. The regex above swallows
        # it, which made "800," split into ["800", ""] and fail the grouping
        # check, so a wage Whisper transcribed as "₹800," grounded to nothing
        # and the pay step silently reported "no number found". Stripping it
        # cannot weaken the malformed-digit guard below: "2,7,7" has no
        # trailing comma and is still rejected unchanged.
        raw = raw.rstrip(",")
        if not raw:
            continue
        if "," in raw and not _is_valid_digit_grouping(raw):
            # Not a number anyone wrote: a comma run of single digits is how
            # speech-to-text renders a number it could not resolve into one
            # token. A real session transcribed "700" as "2,7,7", which
            # stripping commas turned into a confident 277 and put a wrong
            # daily rate on the worker's profile. Dictated digits do NOT
            # arrive this way - "seven zero zero" transcribes as "7000" -
            # so ignoring the token costs nothing real, and leaving the
            # amount ungrounded shows the worker an empty field to correct
            # instead of a wrong number.
            continue
        cleaned = raw.replace(",", "")
        if cleaned:
            try:
                found.add(float(cleaned))
            except ValueError:
                pass

    # Split on separators rather than matching word characters: Python's \w
    # excludes Devanagari vowel signs, which would silently truncate दहा to दह.
    tokens = [t for t in re.split(r"[\s।॥,.!?;:()\[\]{}\"'/\\-]+", text) if t]

    # Number-word phrases. Each token contributes its own value, and a
    # multiplier scales whatever immediately precedes it, so "दहा हजार" ->
    # 10000 while "दहा" -> 10 both count as grounded readings.
    index = 0
    while index < len(tokens):
        token = tokens[index]
        value: Optional[float] = None

        if token in _CONTRACTED_HUNDREDS:
            value = float(_CONTRACTED_HUNDREDS[token])
        elif token in _UNITS:
            value = float(_UNITS[token])

        if value is not None:
            found.add(value)
            # Consume any chain of following multipliers: "पंधरा हजार",
            # "eight hundred", "दोन लाख", "one hundred thousand".
            scaled = value
            look = index + 1
            while look < len(tokens) and tokens[look] in _MULTIPLIERS:
                scaled = scaled * _MULTIPLIERS[tokens[look]]
                found.add(scaled)
                look += 1
            index = look
            continue

        # A bare multiplier with no preceding unit still states a value
        # ("हजार रुपये" -> 1000).
        if token in _MULTIPLIERS:
            found.add(float(_MULTIPLIERS[token]))

        index += 1

    # Garbled number words, admitted only in a money context so that a
    # stray lookalike elsewhere in a sentence can never mint an amount.
    for position, token in enumerate(tokens):
        if token not in _PAY_CONTEXT_VARIANTS:
            continue
        start = max(0, position - _PAY_CONTEXT_WINDOW)
        window = tokens[start : position + _PAY_CONTEXT_WINDOW + 1]
        if any(neighbour in _PAY_CONTEXT for neighbour in window):
            found.add(_PAY_CONTEXT_VARIANTS[token])

    return found


def is_grounded(value: Optional[float], transcript: str) -> bool:
    """True when `value` can be traced to something the transcript says."""
    if value is None:
        return True
    return float(value) in grounded_numbers(transcript)
