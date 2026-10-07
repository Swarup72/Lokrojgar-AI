"""
Deterministic per-field extraction for the guided voice flow.

These cover the rules that keep a guided step honest: a value is returned only
when the transcript actually supports it, 0 is a real answer, the frozen
malformed-digit guard still applies, and no place or name is ever invented.

Marathi, Hindi and English are all exercised because the carrier phrases differ
per language and because Python's \\w silently excludes Devanagari vowel signs -
a validator written with \\w rejected every Marathi and Hindi name while passing
English ones.
"""

import pytest

from app.extraction.field_extraction import extract_city, extract_experience, extract_field, extract_name, extract_pay


# --- name -------------------------------------------------------------------


@pytest.mark.parametrize(
    "transcript,expected",
    [
        ("माझं नाव स्वरूप समीर पाल आहे", "स्वरूप समीर पाल"),
        ("माझे नाव सुनीता जाधव आहे", "सुनीता जाधव"),
        ("मेरा नाम राहुल शर्मा है", "राहुल शर्मा"),
        ("My name is Sunita Jadhav", "Sunita Jadhav"),
        ("I am Rahul Patil", "Rahul Patil"),
        # No carrier phrase at all - a worker who just says their name.
        ("स्वरुप समीर पाला", "स्वरुप समीर पाला"),
        ("Sunita", "Sunita"),
        # Speech-to-text punctuation must not end up inside the name.
        ("माझं नाव स्वरूप पाल आहे.", "स्वरूप पाल"),
    ],
)
def test_name_is_the_transcript_without_its_carrier_phrase(transcript, expected):
    result = extract_name(transcript)
    assert result.ok is True
    assert result.value == expected


@pytest.mark.parametrize(
    "transcript,reason",
    [
        ("", "no_speech"),
        ("आहे", "no_speech"),
        ("माझं नाव 123 आहे", "contains_digits"),
        ("My name is 42", "contains_digits"),
        # A whole sentence rather than an answer to "say your name".
        ("मला आठशे रुपये रोज पाहिजे आणि मी इलेक्ट्रिशियन आहे आणि पुण्यात राहतो", "too_many_words"),
    ],
)
def test_a_name_that_is_not_a_name_is_left_unresolved(transcript, reason):
    result = extract_name(transcript)
    assert result.ok is False
    assert result.value is None, "nothing may be invented for a name"
    assert result.reason == reason


def test_a_real_name_is_never_corrected_or_normalized():
    # Names are whatever the person says. This platform serves people whose names
    # are in no dictionary, so a "did you mean" correction would be a defect.
    result = extract_name("माझं नाव स्वरुप समिर पाला आहे")
    assert result.value == "स्वरुप समिर पाला"


# --- pay --------------------------------------------------------------------


@pytest.mark.parametrize(
    "transcript,expected",
    [
        ("मला आठशे रुपये रोज पाहिजे", 800.0),
        ("मला अठशे रुपय रोज पहिजेत।", 800.0),  # a real Whisper output
        ("मला 700 रुपये पाहिजे", 700.0),
        ("I want 15,000 rupees", 15000.0),
        ("मुझे दस हजार रुपये चाहिए", 10000.0),
        ("मला, दहा हजार रुपये रोज पाइजेत.", 10000.0),  # a real Whisper output
    ],
)
def test_pay_is_read_from_numbers_the_transcript_states(transcript, expected):
    result = extract_pay(transcript)
    assert result.ok is True
    assert result.value == expected


def test_zero_pay_is_a_real_answer():
    # The schema permits 0, and "we will discuss it" is a real thing to say.
    result = extract_pay("मला शून्य रुपये")
    assert result.ok is True
    assert result.value == 0.0


def test_the_frozen_malformed_digit_guard_still_applies_to_pay():
    # "700" once transcribed as "2,7,7" and became a confident 277 on a worker's
    # profile. grounded_numbers() rejects that token, so nothing is extracted and
    # the worker is asked again - an empty field is recoverable, a wrong rate is not.
    result = extract_pay("मला 2,7,7 रुपये पाहिजे")
    assert result.ok is False
    assert result.value is None
    assert result.reason == "no_number_found"


@pytest.mark.parametrize("transcript", ["1,0,0,0 रुपये", "मला 2,7,7", "3,4,5 rupees"])
def test_no_malformed_comma_run_ever_yields_a_pay_value(transcript):
    assert extract_pay(transcript).value is None


def test_pay_with_no_number_at_all_is_unresolved():
    result = extract_pay("मला चांगला पगार पाहिजे")
    assert result.ok is False
    assert result.reason == "no_number_found"


def test_two_unrelated_amounts_are_not_guessed_between():
    # Guessing here would put one of them on the worker's profile as their rate.
    result = extract_pay("मला 700 किंवा 950 रुपये पाहिजे")
    assert result.ok is False
    assert result.reason == "multiple_amounts"
    assert result.candidates == [700.0, 950.0], "the UI needs the candidates to ask which"


def test_an_implausibly_small_amount_is_rejected_but_zero_is_not():
    assert extract_pay("मला 3 रुपये").ok is False
    assert extract_pay("मला शून्य रुपये").ok is True


# --- experience -------------------------------------------------------------


@pytest.mark.parametrize(
    "transcript,expected",
    [
        ("मला पाच वर्षांचा अनुभव आहे", 5.0),
        ("मुझे 10 साल का अनुभव है", 10.0),
        ("I have 1 year experience", 1.0),
        ("मला एक वर्षाचा अनुभव", 1.0),
    ],
)
def test_experience_is_read_from_the_transcript(transcript, expected):
    result = extract_experience(transcript)
    assert result.ok is True
    assert result.value == expected


def test_zero_experience_is_a_real_answer():
    # A first job. This is the case the old truthiness guard silently dropped.
    result = extract_experience("मला शून्य वर्ष अनुभव आहे")
    assert result.ok is True
    assert result.value == 0.0


@pytest.mark.parametrize("years", [61, 80, 100, 1500])
def test_experience_beyond_a_working_lifetime_is_rejected(years):
    result = extract_experience(f"I have {years} years experience")
    assert result.ok is False
    assert result.value is None
    assert result.reason == "out_of_range"


def test_sixty_years_is_still_accepted_at_the_boundary():
    assert extract_experience("I have 60 years experience").value == 60.0


def test_experience_with_no_number_is_unresolved():
    result = extract_experience("no experience")
    assert result.ok is False
    assert result.reason == "no_number_found"


def test_experience_never_takes_a_number_from_a_malformed_run():
    assert extract_experience("मला 2,7,7 वर्ष अनुभव").value is None


# --- city -------------------------------------------------------------------


@pytest.mark.parametrize(
    "transcript,expected",
    [
        ("मी कोल्हापूरमध्ये राहतो", "कोल्हापूर"),
        # The locative form is kept as spoken rather than stemmed back to
        # "पुणे": guessing at grammar risks mangling a real place name, and the
        # review screen is where the worker corrects spelling.
        ("मी पुण्यात राहतो", "पुण्यात"),
        ("I live in Mumbai", "Mumbai"),
        ("मेरा गाँव शिरोली है", "शिरोली"),
        ("पुणे", "पुणे"),
        ("I am from Kolhapur", "Kolhapur"),
    ],
)
def test_city_keeps_the_place_the_worker_actually_named(transcript, expected):
    result = extract_city(transcript)
    assert result.ok is True
    assert result.value == expected


def test_no_default_city_is_ever_substituted():
    # Registration used to seed Pune coordinates for everyone; nothing in this
    # path may reintroduce a default place.
    for transcript in ["", "मी राहतो", "I live in"]:
        result = extract_city(transcript)
        assert result.ok is False
        assert result.value is None
        assert "पुणे" not in str(result.value) and "Pune" not in str(result.value)


def test_city_with_digits_is_unresolved():
    assert extract_city("I live in 400001").ok is False


# --- dispatch ---------------------------------------------------------------


def test_skills_has_no_deterministic_extractor_by_design():
    # Skills is the one field that needs the language model; keeping it out of
    # this table is what makes "one Qwen call per guided session" checkable.
    with pytest.raises(ValueError):
        extract_field("skills", "मी इलेक्ट्रिशियन आहे")


def test_an_unknown_field_is_rejected_rather_than_guessed():
    with pytest.raises(ValueError):
        extract_field("favouriteColour", "निळा")


def test_every_deterministic_field_returns_its_own_name():
    for field, transcript in [
        ("fullName", "माझं नाव स्वरूप आहे"),
        ("expectedPay", "मला 800 रुपये"),
        ("experienceYears", "5 वर्ष"),
        ("city", "पुणे"),
    ]:
        assert extract_field(field, transcript).field == field
