"""
Deterministic per-field extraction for the guided voice JOB POSTING flow.

Same contract as the worker fields: a value is returned only when the employer
actually said it, numbers come from grounded_numbers() so the frozen
malformed-digit guard applies, and anything ambiguous stays unresolved with a
reason rather than being guessed.

The stakes differ from the worker side, which is why the ambiguity cases here
are exhaustive: a wrong value does not sit quietly in a profile, it is
published as the terms of a live job advert. A pay frequency guessed as
"daily" on a monthly salary advertises a wage thirty times too low.

Marathi, Hindi and English are each exercised because the carrier phrases are
entirely different per language — an employer asks for workers ("मला दोन
इलेक्ट्रिशियन पाहिजेत") rather than stating a fact about themselves.
"""

import pytest

from app.extraction.field_extraction import (
    DETERMINISTIC_FIELDS,
    LLM_FIELDS,
    extract_field,
    extract_job_city,
    extract_job_description,
    extract_job_pay_amount,
    extract_job_pay_type,
    extract_job_title,
    extract_job_worker_count,
)


# --- the three worked examples from the specification ----------------------
#
# Each is run end to end across every field the sentence supports, because the
# guided flow asks one question at a time but an employer answering the title
# question often states the whole job in one breath.

MARATHI = "मला वायरिंगच्या कामासाठी दोन इलेक्ट्रिशियन पाहिजेत. काम कोल्हापूरमध्ये आहे. रोज ८०० रुपये मिळतील."
HINDI = "मुझे वायरिंग के काम के लिए दो इलेक्ट्रीशियन चाहिए। काम कोल्हापुर में है। रोज़ ८०० रुपये मिलेंगे।"
ENGLISH = "I need two electricians for wiring work in Kolhapur. The pay is 800 per day."


@pytest.mark.parametrize("transcript", [MARATHI, HINDI, ENGLISH])
def test_worker_count_is_two_in_every_language(transcript):
    result = extract_job_worker_count(transcript)
    assert result.ok, result.reason
    assert result.value == 2
    assert isinstance(result.value, int)


@pytest.mark.parametrize("transcript", [MARATHI, HINDI, ENGLISH])
def test_pay_amount_is_eight_hundred_in_every_language(transcript):
    result = extract_job_pay_amount(transcript)
    assert result.ok, result.reason
    assert result.value == 800


@pytest.mark.parametrize("transcript", [MARATHI, HINDI, ENGLISH])
def test_pay_type_is_daily_in_every_language(transcript):
    result = extract_job_pay_type(transcript)
    assert result.ok, result.reason
    assert result.value == "daily"


# --- pay type ---------------------------------------------------------------


@pytest.mark.parametrize(
    "transcript,expected",
    [
        ("महिन्याला २०००० रुपये", "monthly"),
        ("हर महीने 20000 रुपये", "monthly"),
        ("20000 per month", "monthly"),
        ("पूर्ण कामासाठी एकरकमी ५०००० ", "fixed"),
        ("पूरे काम का एकमुश्त 50000", "fixed"),
        ("50000 lump sum for the whole job", "fixed"),
        ("दिवसाला ७०० रुपये", "daily"),
        ("दिहाड़ी 700", "daily"),
    ],
)
def test_pay_type_recognises_each_spoken_form(transcript, expected):
    result = extract_job_pay_type(transcript)
    assert result.ok, result.reason
    assert result.value == expected


def test_pay_type_refuses_to_choose_between_two_frequencies():
    """An employer offering a choice has not answered the question."""
    result = extract_job_pay_type("रोज ८०० किंवा महिन्याला २०००० ")
    assert not result.ok
    assert result.value is None
    assert result.reason == "multiple_pay_types"


def test_pay_type_is_empty_when_no_frequency_was_spoken():
    result = extract_job_pay_type("आठशे रुपये")
    assert not result.ok
    assert result.value is None
    assert result.reason == "no_pay_type_found"


# --- worker count -----------------------------------------------------------


def test_worker_count_rejects_a_fraction_rather_than_rounding():
    """Rounding would silently change how many people the advert hires."""
    result = extract_job_worker_count("2.5 workers")
    assert not result.ok
    assert result.value is None


def test_worker_count_refuses_two_plausible_counts():
    result = extract_job_worker_count("I need 2 or 3 electricians")
    assert not result.ok
    assert result.reason == "multiple_numbers"
    assert result.candidates == [2, 3]


def test_worker_count_rejects_zero_and_absurd_counts():
    assert not extract_job_worker_count("I need 0 workers").ok
    assert not extract_job_worker_count("I need 5000 workers").ok


def test_worker_count_has_no_default_when_nothing_was_said():
    result = extract_job_worker_count("I need electricians")
    assert not result.ok
    assert result.value is None
    assert result.reason == "no_number_found"


# --- the frozen malformed-digit guard still applies -------------------------


def test_malformed_digits_yield_no_pay_amount():
    """"2,7,7" is not 277 — the frozen number-grounding guard, unchanged."""
    result = extract_job_pay_amount("पगार 2,7,7 रुपये")
    assert not result.ok
    assert result.value is None


def test_malformed_digits_yield_no_worker_count():
    result = extract_job_worker_count("मला 1,2 माणसं पाहिजेत")
    assert not result.ok
    assert result.value is None


def test_pay_amount_refuses_two_unrelated_amounts():
    result = extract_job_pay_amount("कोणाला ८०० तर कोणाला ९५० रुपये")
    assert not result.ok
    assert result.reason == "multiple_amounts"


def test_pay_amount_reads_a_composite_number_as_one_amount():
    """"दहा हजार" grounds as both 10 and 10000; the composite is the amount."""
    result = extract_job_pay_amount("महिन्याला दहा हजार रुपये")
    assert result.ok, result.reason
    assert result.value == 10000


# --- city -------------------------------------------------------------------


@pytest.mark.parametrize(
    "transcript,expected",
    [
        ("काम कोल्हापूरमध्ये आहे", "कोल्हापूर"),
        ("काम कोल्हापुर में है", "कोल्हापुर"),
        ("The work is in Kolhapur", "Kolhapur"),
    ],
)
def test_city_strips_the_carrier_in_every_language(transcript, expected):
    result = extract_job_city(transcript)
    assert result.ok, result.reason
    assert result.value == expected


def test_city_is_never_invented_from_a_numeric_answer():
    result = extract_job_city("800")
    assert not result.ok
    assert result.value is None


def test_city_is_empty_when_nothing_was_said():
    result = extract_job_city("   ")
    assert not result.ok
    assert result.value is None


# --- title / description ----------------------------------------------------


@pytest.mark.parametrize(
    "transcript",
    [
        "मला इलेक्ट्रिशियन पाहिजेत",
        "मुझे इलेक्ट्रीशियन चाहिए",
        "I need an electrician",
    ],
)
def test_job_title_keeps_the_work_type_and_drops_the_request(transcript):
    result = extract_job_title(transcript)
    assert result.ok, result.reason
    assert "इलेक्ट्रिशियन" in result.value or "इलेक्ट्रीशियन" in result.value or "electrician" in result.value.lower()
    # the request wording itself must not survive into the advert's title
    for carrier in ("पाहिजेत", "चाहिए", "I need", "i need"):
        assert carrier not in result.value


def test_job_title_rejects_a_bare_number():
    result = extract_job_title("800")
    assert not result.ok
    assert result.value is None


def test_job_description_is_kept_as_spoken():
    spoken = "घराच्या वायरिंगचे काम आहे आणि स्विच बोर्ड बसवायचे आहेत"
    result = extract_job_description(spoken)
    assert result.ok, result.reason
    assert "स्विच बोर्ड" in result.value


def test_job_description_rejects_silence():
    result = extract_job_description("")
    assert not result.ok
    assert result.reason == "no_speech"


# --- dispatch / registration ------------------------------------------------


@pytest.mark.parametrize(
    "field",
    ["jobTitle", "jobDescription", "jobWorkerCount", "jobPayAmount", "jobPayType", "jobCity"],
)
def test_every_job_field_is_reachable_through_the_dispatcher(field):
    result = extract_field(field, "काम कोल्हापूरमध्ये आहे, रोज ८०० रुपये, दोन माणसं")
    assert result.field == field


def test_job_fields_are_registered_for_the_api_whitelist():
    for field in (
        "jobTitle",
        "jobDescription",
        "jobWorkerCount",
        "jobPayAmount",
        "jobPayType",
        "jobCity",
    ):
        assert field in DETERMINISTIC_FIELDS


def test_job_skills_is_an_llm_field_not_a_deterministic_one():
    """Mapping free speech onto the catalog is the one thing parsing cannot do."""
    assert "jobSkills" in LLM_FIELDS
    assert "jobSkills" not in DETERMINISTIC_FIELDS
    with pytest.raises(ValueError):
        extract_field("jobSkills", "electrician")


def test_worker_fields_are_untouched_by_the_job_additions():
    """The frozen worker flow must still dispatch exactly as before."""
    for field in ("fullName", "expectedPay", "experienceYears", "city", "businessName", "businessType"):
        assert field in DETERMINISTIC_FIELDS
    assert extract_field("expectedPay", "रोज ८०० रुपये").value == 800


def test_pay_type_handles_hinglish_per_day_as_whisper_renders_it():
    """
    Observed end to end: an English "rupees per day" spoken into a recording
    came back from Whisper as "रुपीज पर दे". A real Hinglish speaker produces
    the same shape, so the spoken-forms list covers it.
    """
    result = extract_job_pay_type("रुपीज पर दे.")
    assert result.ok, result.reason
    assert result.value == "daily"


# --- ambiguous critical values must fail safe, never guess ------------------
#
# The reported concern: a Hindi "आठ सौ रुपये" (800) transcribed as "आठ सो
# रुपये" would be read as 8. It is not - "सो" is not a number word, so the
# only grounded value is 8 from "आठ", and 8 is below the plausible-pay floor,
# so the field stays EMPTY for the employer to correct. A silently wrong wage
# is far worse than a blank one.


@pytest.mark.parametrize("transcript", ["आठ सो रुपये", "8 रुपये", "₹8", "eight rupees"])
def test_an_implausible_wage_is_refused_rather_than_accepted(transcript):
    result = extract_job_pay_amount(transcript)
    assert not result.ok, f"{transcript!r} was accepted as {result.value}"
    assert result.value is None


def test_the_correctly_spoken_hindi_amount_still_works():
    result = extract_job_pay_amount("आठ सौ रुपये")
    assert result.ok, result.reason
    assert result.value == 800


@pytest.mark.parametrize(
    "transcript,expected",
    [
        ("15,000 per month", 15000),
        ("1,50,000 for the whole job", 150000),
        ("पंधरा हजार रुपये", 15000),
        ("₹800,", 800),
    ],
)
def test_indian_number_formats_are_grounded(transcript, expected):
    result = extract_job_pay_amount(transcript)
    assert result.ok, f"{transcript!r} -> {result.reason}"
    assert result.value == expected


def test_a_failed_pay_step_does_not_invalidate_other_fields():
    """
    The guided flow asks one question at a time, so each step is parsed from
    its own short answer. A step that cannot be grounded returns None for
    ITSELF and leaves every other field's result untouched.
    """
    assert extract_job_worker_count("मला दोन माणसे पाहिजेत").value == 2
    assert extract_job_city("काम कोल्हापूरमध्ये आहे").value == "कोल्हापूर"
    # the ambiguous wage, asked on its own step, still refuses
    pay = extract_job_pay_amount("आठ सो रुपये")
    assert not pay.ok and pay.value is None
    # and the earlier two are unaffected by it
    assert extract_job_worker_count("मला दोन माणसे पाहिजेत").value == 2


def test_a_wage_mentioned_alongside_the_headcount_does_not_confuse_it():
    """
    An employer often states both in one breath. The headcount's 1-99 bound
    excludes the wage, so the count still resolves - the range is doing real
    disambiguation work, not just rejecting nonsense.
    """
    result = extract_job_worker_count("मला दोन इलेक्ट्रिशियन पाहिजेत, आठशे रुपये")
    assert result.ok, result.reason
    assert result.value == 2
    assert result.candidates == [2.0], "the wage leaked into the headcount candidates"


def test_two_genuinely_plausible_headcounts_are_refused():
    """When both numbers could be a headcount, neither is picked."""
    result = extract_job_worker_count("मला दोन किंवा तीन माणसे पाहिजेत")
    assert not result.ok
    assert result.reason == "multiple_numbers"
