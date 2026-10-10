"""
Regression tests for the numeric grounding guard.

Context: a real browser session produced the transcript
"...माजा पी हा आच्छे रूपे एट हंडेट रूपीज आहे" - eight hundred, stated twice,
once garbled in Marathi and once transliterated from English - and the
extractor returned expectedPay = 10000, a number the transcript never
contained. These tests pin both halves of the contract: a number the
transcript really states is kept, and one it does not state is dropped.
"""

import pytest

from app.extraction.extractor import _drop_ungrounded_numbers
from app.extraction.models import ExtractedProfile
from app.extraction.number_grounding import grounded_numbers, is_grounded

# The exact transcript from the reported session.
REAL_GARBLED_TRANSCRIPT = (
    "माजा नावस बरूप समीर पाल आहे मी गेले धावर्ष जलो इलेक्टरिशिंची काम करते हैं "
    "माजा पी हा आच्छे रूपे एट हंडेट रूपीज आहे"
)


@pytest.mark.parametrize(
    "transcript,value",
    [
        # Marathi number words
        ("मला दहा हजार रुपये पाहिजे.", 10000),
        ("मला दहा हजार रुपये रोज पाहिजे.", 10000),
        ("मला सातशे रुपये पाहिजे.", 700),
        ("मला सातशे रुपये रोज पाहिजे.", 700),
        ("मला आठशे रुपये पाहिजे.", 800),
        ("मला पंधरा हजार रुपये पाहिजे.", 15000),
        ("दोन लाख रुपये", 200000),
        ("मी दहा वर्षांचा अनुभव ठेवतो.", 10),
        ("मी पाच वर्षांपासून काम करतो", 5),
        ("चार वर्षांचा अनुभव", 4),
        # Hindi number words
        ("मुझे आठ सौ रुपये चाहिए।", 800),
        ("मुझे पंद्रह हजार रुपये चाहिए।", 15000),
        ("मुझे पाँच साल का अनुभव है", 5),
        ("मुझे दस हजार रुपये चाहिए।", 10000),
        # English number words
        ("I want eight hundred rupees.", 800),
        ("I want fifteen thousand rupees.", 15000),
        ("I have ten years of experience.", 10),
        # Digits: ASCII, Devanagari, grouped
        ("मला ७०० रुपये पाहिजे.", 700),
        ("मला 700 रुपये पाहिजे.", 700),
        ("मला 15,000 रुपये पाहिजे.", 15000),
        ("मला १५,००० रुपये पाहिजे.", 15000),
        ("I have 4 years experience", 4),
        # Code-switched
        ("माझं नाव Swarup आहे. मला 700 rupees daily पाहिजे.", 700),
        ("मुझे 5 years experience है और 15,000 rupees चाहिए।", 15000),
    ],
)
def test_real_numbers_are_grounded(transcript, value):
    assert is_grounded(value, transcript), f"{value} should be grounded in {transcript!r}"


@pytest.mark.parametrize(
    "transcript,value",
    [
        (REAL_GARBLED_TRANSCRIPT, 10000),  # the reported hallucination
        (REAL_GARBLED_TRANSCRIPT, 5),      # invented experienceYears
        ("माझं नाव स्वरूप आहे. मी इलेक्ट्रिशियन आहे.", 800),
        ("मला काम पाहिजे.", 10000),
        ("I am a plumber looking for work.", 500),
        ("मला सातशे रुपये पाहिजे.", 7000),   # 10x slip must not pass
        ("मला आठशे रुपये पाहिजे.", 700),     # wrong-but-plausible value
    ],
)
def test_absent_numbers_are_not_grounded(transcript, value):
    assert not is_grounded(value, transcript)


def test_none_is_always_grounded():
    assert is_grounded(None, "anything")
    assert is_grounded(None, "")


def test_garbled_transcript_yields_no_numbers_at_all():
    assert grounded_numbers(REAL_GARBLED_TRANSCRIPT) == set()


def test_multiplier_chain_keeps_every_reading():
    # "दहा हजार" must ground both 10 and 10000 - the extractor may legitimately
    # report either depending on what the sentence is about.
    values = grounded_numbers("मला दहा हजार रुपये पाहिजे.")
    assert 10 in values and 10000 in values


# --- the guard applied to a whole profile -----------------------------------


def test_guard_drops_the_reported_hallucination():
    profile = ExtractedProfile(
        fullName="समीर पाल", experienceYears=5, expectedPay=10000, skills=["इलेक्ट्रिशिंची"]
    )

    guarded = _drop_ungrounded_numbers(profile, REAL_GARBLED_TRANSCRIPT)

    assert guarded.expected_pay is None
    assert guarded.experience_years is None
    # Non-numeric fields must survive untouched.
    assert guarded.full_name == "समीर पाल"
    assert guarded.skills == ["इलेक्ट्रिशिंची"]


def test_guard_keeps_everything_on_a_clean_transcript():
    transcript = "माझं नाव स्वरूप समीर पाल आहे. मला दहा हजार रुपये रोज पाहिजे. मी पाच वर्षांचा अनुभव ठेवतो."
    profile = ExtractedProfile(
        fullName="स्वरूप समीर पाल", experienceYears=5, expectedPay=10000, city="पुणे"
    )

    guarded = _drop_ungrounded_numbers(profile, transcript)

    assert guarded.expected_pay == 10000
    assert guarded.experience_years == 5
    assert guarded.full_name == "स्वरूप समीर पाल"
    assert guarded.city == "पुणे"


def test_guard_never_invents_a_value():
    # Transcript states a pay, model returned none - the guard must not fill it in.
    profile = ExtractedProfile(fullName="स्वरूप", expectedPay=None, experienceYears=None)

    guarded = _drop_ungrounded_numbers(profile, "मला आठशे रुपये पाहिजे.")

    assert guarded.expected_pay is None
    assert guarded.experience_years is None


def test_guard_drops_only_the_ungrounded_field():
    # Pay is real, experience is invented.
    profile = ExtractedProfile(expectedPay=800, experienceYears=7)

    guarded = _drop_ungrounded_numbers(profile, "मला आठशे रुपये पाहिजे.")

    assert guarded.expected_pay == 800
    assert guarded.experience_years is None


def test_guard_returns_the_same_object_when_nothing_changes():
    profile = ExtractedProfile(expectedPay=800)
    assert _drop_ungrounded_numbers(profile, "मला आठशे रुपये पाहिजे.") is profile


# --- STT-variant grounding (context gated) ----------------------------------
# Whisper, with the production initial_prompt, renders आठशे as अठशे/आठशी on
# the real recordings. Those spellings are admitted ONLY beside a money word,
# so a lookalike elsewhere in a sentence can never mint an amount.


@pytest.mark.parametrize(
    "transcript",
    [
        "मला आठशे रुपये रोज पाहिजे.",                 # canonical
        "मला अठशे रुपय रोज पहिजेत।",                   # 02-pay-800.wav, with prompt
        "मला आठशी रुपये रोज पाहिजे",                   # 05-full-profile.wav shape
        "माचर नाव स्वरुप समीर पाला हे, मला पाच वर्षाचा अनुभवा हे, "
        "मी इलेक्ट्रिशियन्च काम करतो, आनि मला आठशी रुपय रोज पहीजेत.",
    ],
)
def test_observed_800_variants_ground_in_a_pay_context(transcript):
    assert is_grounded(800, transcript)


@pytest.mark.parametrize(
    "transcript",
    [
        "अठशे",                      # no money word at all
        "ते आठशी होते",               # lookalike in unrelated prose
        "माझं नाव अठशे आहे",          # in a name context, not a pay context
        "मी अठशे वर्षे काम केले",      # adjacent to a duration, not an amount
    ],
)
def test_800_variants_do_not_ground_without_a_pay_context(transcript):
    assert not is_grounded(800, transcript)


def test_variant_list_stays_narrow():
    # आच्छे / आच्ची were the PRE-prompt garbles. They are deliberately absent:
    # they are too far from आठशे to be safe evidence, and the reported
    # hallucination (expectedPay=10000) came from exactly such a transcript.
    from app.extraction.number_grounding import _PAY_CONTEXT_VARIANTS

    assert set(_PAY_CONTEXT_VARIANTS) == {"अठशे", "आठशी"}
    assert not is_grounded(800, "माजा पी हा आच्छे रूपे आहे")
    assert not is_grounded(800, "मला आच्ची रुपे रोज पही जेत")


@pytest.mark.parametrize(
    "transcript,value",
    [
        ("मला सातशे रुपये पाहिजे.", 700),
        ("मला नऊशे रुपये पाहिजे.", 900),
        ("मला दहा हजार रुपये रोज पाहिजे.", 10000),
        ("मला 10,000 रुपे रोज बाईजेत", 10000),
        ("मला पंधरा हजार रुपये पाहिजे.", 15000),
        ("मुझे आठ सौ रुपये चाहिए।", 800),
        ("I want eight hundred rupees.", 800),
        ("मला ७०० रुपये पाहिजे.", 700),
    ],
)
def test_existing_grounding_unchanged_by_the_variant_addition(transcript, value):
    assert is_grounded(value, transcript)


def test_hallucinated_pay_is_still_rejected_after_adding_variants():
    # The originally reported failure must stay rejected.
    assert not is_grounded(10000, REAL_GARBLED_TRANSCRIPT)
    assert grounded_numbers(REAL_GARBLED_TRANSCRIPT) == set()


def test_guard_keeps_800_on_the_improved_variant_transcripts():
    """With the production initial_prompt the STT output is a near-miss
    spelling; the guard must let a correct 800 through rather than clearing
    it, which is what previously made the pay field come back blank."""
    for transcript in (
        "मला अठशे रुपय रोज पहिजेत।",
        "माचर नाव स्वरुप समीर पाला हे, मला पाच वर्षाचा अनुभवा हे, "
        "मी इलेक्ट्रिशियन्च काम करतो, आनि मला आठशी रुपय रोज पहीजेत.",
    ):
        profile = ExtractedProfile(expectedPay=800, experienceYears=5)
        guarded = _drop_ungrounded_numbers(profile, transcript)
        assert guarded.expected_pay == 800, transcript


def test_guard_still_clears_a_wrong_amount_on_a_variant_transcript():
    """Admitting अठशे as evidence for 800 must not admit any other number."""
    profile = ExtractedProfile(expectedPay=10000)
    guarded = _drop_ungrounded_numbers(profile, "मला अठशे रुपय रोज पहिजेत।")
    assert guarded.expected_pay is None


# --- malformed digit groupings are not numbers ------------------------------
# A real session: the speaker said "700", Whisper wrote "2,7,7", and stripping
# commas turned that into a confident 277 that was shown as the worker's daily
# rate. Dictated digits do not arrive this way ("seven zero zero" transcribes
# as "7000"), so a comma run of single digits is a transcription artifact and
# must not ground any amount.

REAL_277_TRANSCRIPT = (
    "माज़, नाव, समर्थ पाटिल, आहे, मी, 2,7,7 रुपय घेतो, मला, कॉल्लापूर मधे काम पाईजे, "
    "मी, प्लंबिंग, चे काम करतो, मला, 5 वर्ष जाल, अनुभव, आहे."
)


def test_single_digit_comma_run_grounds_no_amount():
    values = grounded_numbers(REAL_277_TRANSCRIPT)

    assert 277 not in values, "'2,7,7' must not be read as 277"
    assert 700 not in values, "700 is not in the transcript and must never be invented"
    # The genuine experience figure in the same sentence still grounds.
    assert 5 in values


def test_the_reported_277_is_cleared_from_the_profile():
    profile = ExtractedProfile(fullName="समर्थ पाटिल", experienceYears=5, expectedPay=277, skills=["plumbing"])

    guarded = _drop_ungrounded_numbers(profile, REAL_277_TRANSCRIPT)

    assert guarded.expected_pay is None, "a wrong amount must become an empty field, not a wrong number"
    assert guarded.experience_years == 5, "the valid experience value must survive"
    assert guarded.full_name == "समर्थ पाटिल"
    assert guarded.skills == ["plumbing"]


@pytest.mark.parametrize(
    "transcript,value",
    [
        ("मला 15,000 रुपये पाहिजे.", 15000),      # western grouping
        ("मला १५,००० रुपये पाहिजे.", 15000),      # Devanagari digits, grouped
        ("pay 1,50,000 rupees", 150000),          # Indian lakh grouping
        ("मला 1,000 रुपये पाहिजे.", 1000),
    ],
)
def test_real_comma_grouped_numbers_still_ground(transcript, value):
    assert is_grounded(value, transcript)


@pytest.mark.parametrize(
    "transcript,bogus",
    [
        ("मी, 2,7,7 रुपय घेतो", 277),
        ("rate is 1,2,3 rupees", 123),
        ("pay 7,0,0 rupees", 700),   # even a "correct-looking" digit run is not trusted
    ],
)
def test_malformed_groupings_ground_nothing(transcript, bogus):
    assert not is_grounded(bogus, transcript)


def test_plain_digits_are_unaffected_by_the_grouping_rule():
    # No comma -> the rule does not apply at all.
    for transcript, value in [
        ("एक्सक्षपेट पे 700 रुपई", 700),
        ("I want 7000", 7000),
        ("मला ७०० रुपये पाहिजे.", 700),
        ("मला 800 रुपये पाहिजे.", 800),
    ]:
        assert is_grounded(value, transcript), transcript


# --- trailing punctuation ---------------------------------------------------
#
# Found end to end: a wage spoken as "eight hundred rupees" was transcribed
# "₹800," and grounded to NOTHING, so the guided pay step reported
# "no number found" on a perfectly clear answer. The trailing comma was being
# read as digit grouping, which made "800," split into ["800", ""].


def test_a_trailing_comma_does_not_hide_the_number():
    assert grounded_numbers("₹800,") == {800.0}
    assert grounded_numbers("800,") == {800.0}


def test_several_numbers_each_followed_by_a_comma():
    assert grounded_numbers("700, and 900,") == {700.0, 900.0}


def test_the_malformed_digit_guard_is_unchanged_by_that():
    # The frozen guarantee: "2,7,7" is not 277, and must still ground to
    # nothing after the trailing-comma fix.
    assert grounded_numbers("2,7,7") == set()
    assert grounded_numbers("पगार 2,7,7 रुपये") == set()
    assert grounded_numbers("1,2") == set()


def test_real_digit_grouping_still_works():
    assert 15000.0 in grounded_numbers("15,000")
    assert 150000.0 in grounded_numbers("1,50,000")
