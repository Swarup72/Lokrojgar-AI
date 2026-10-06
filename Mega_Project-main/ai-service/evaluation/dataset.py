"""
Labelled evaluation dataset for the voice-profile pipeline.

NOT production code and NOT part of the pytest suite (pytest.ini sets
testpaths = tests, so nothing in evaluation/ is ever collected). Nothing
here is imported by app/ - this package only reads the production code.

Each case is a transcript with KNOWN expected field values, so extraction
can be scored per field instead of judged by eye.

Expected-value conventions
--------------------------
- A number means the value must be exactly that number.
- None means the transcript does NOT state that field, so the extractor
  must return null. These are the grounding checks: returning any value
  is an invention, not a near miss.
- A list of strings is a list of ACCEPTED surface forms for a text field
  (e.g. "कोल्हापूर" / "कोल्हापूरमध्ये" / "Kolhapur" are all accepted for
  the same city). Accepting known-equivalent spellings keeps the score
  about information loss rather than orthography.
- skills is a list of CONCEPTS, each concept being a list of accepted
  names for it. Scoring compares the set of concepts, so "plumbing" and
  "प्लंबिंग" count as the same skill.
- SKIP means the correct behaviour is genuinely undefined, so the field
  is not scored for that case. bio and availability are never scored.

Where a label is a judgement call rather than a fact, it is stated in
`notes` so a reader can disagree with the label itself.
"""

from typing import Any, Dict, List, Optional, Union

# Sentinel for "do not score this field in this case".
SKIP = "__SKIP__"

# Reusable accepted-form lists.
PLUMBING = ["plumbing", "plumber", "प्लंबिंग", "प्लंबर", "प्लांबर", "नळ काम", "नलसाजी"]
CARPENTRY = ["carpentry", "carpenter", "सुतारकाम", "सुतार", "बढ़ई", "लकूडकाम"]
PAINTING = ["painting", "painter", "पेंटिंग", "पेंटर", "रंगकाम"]
# "electrical wiring" was added after the first run: the extractor returned
# it for an electrician and the original label simply hadn't listed that
# compound form. That is a defect in the label, not in the model, so the
# label was corrected and the run re-scored. Recorded here so the change is
# visible rather than silently improving the score.
ELECTRICAL = [
    "electrician", "electrical", "electrical work", "electrical wiring", "wiring",
    "इलेक्ट्रिशियन", "इलेक्ट्रिकल", "वायरिंग",
]

KOLHAPUR = ["कोल्हापूर", "कोल्हापुर", "कोल्हापूरमध्ये", "Kolhapur"]
PUNE = ["पुणे", "पुण्यात", "पुण्यामध्ये", "Pune", "पुना"]
MUMBAI = ["मुंबई", "मुंबईमध्ये", "मुंबई में", "Mumbai"]
NAGPUR = ["नागपूर", "नागपुर", "नागपूरमध्ये", "Nagpur"]


def case(
    case_id: str,
    language: str,
    tags: List[str],
    transcript: str,
    full_name: Union[None, str, List[str]] = SKIP,
    experience_years: Union[None, float, str] = SKIP,
    expected_pay: Union[None, float, str] = SKIP,
    city: Union[None, str, List[str]] = SKIP,
    skills: Union[None, List[List[str]], str] = SKIP,
    notes: str = "",
) -> Dict[str, Any]:
    def as_list(value: Any) -> Any:
        if isinstance(value, str) and value != SKIP:
            return [value]
        return value

    return {
        "id": case_id,
        "language": language,
        "tags": tags,
        "transcript": transcript,
        "expected": {
            "fullName": as_list(full_name),
            "experienceYears": experience_years,
            "expectedPay": expected_pay,
            "city": as_list(city),
            "skills": skills,
        },
        "notes": notes,
    }


# --------------------------------------------------------------------------
# A. Full utterances - realistic sentences, every field labelled.
# --------------------------------------------------------------------------

UTTERANCES = [
    case(
        "U01-mr-name-exp-pay-city", "mr", ["utterance", "name", "experience", "pay", "city", "grounding"],
        "माझं नाव समीर पाल आहे. मला चार वर्षांचा अनुभव आहे. मला सातशे रुपये रोज पाहिजे. मी कोल्हापूरमध्ये राहतो.",
        full_name="समीर पाल", experience_years=4, expected_pay=700, city=KOLHAPUR, skills=None,
        notes="No trade is named, so skills must be null. This is the transcript the diagnosis found returns pay=7000.",
    ),
    case(
        "U02-mr-carpenter", "mr", ["utterance", "name", "experience", "pay", "city", "skills"],
        "माझं नाव सुनीता जाधव आहे. मी पाच वर्षांपासून सुतारकाम करते. माझा दर आठशे रुपये रोज आहे. मी पुण्यात राहते.",
        full_name="सुनीता जाधव", experience_years=5, expected_pay=800, city=PUNE, skills=[CARPENTRY],
    ),
    case(
        "U03-mr-electrician-nopay", "mr", ["utterance", "name", "experience", "city", "skills", "grounding"],
        "माझं नाव सर्वेश महाडिक आहे. मी दहा वर्षांचा इलेक्ट्रिशियनचा अनुभव ठेवतो. मी नागपूरमध्ये काम शोधतो आहे.",
        full_name="सर्वेश महाडिक", experience_years=10, expected_pay=None, city=NAGPUR, skills=[ELECTRICAL],
        notes="No pay stated - expectedPay must stay null.",
    ),
    case(
        "U04-mr-devanagari-digits-pay", "mr", ["utterance", "name", "pay", "skills", "grounding"],
        "माझं नाव अनिल पाटील आहे. मी प्लंबर आहे आणि मला ७०० रुपये रोज पाहिजे.",
        full_name="अनिल पाटील", experience_years=None, expected_pay=700, city=None, skills=[PLUMBING],
        notes="Devanagari digits for pay; no experience and no city stated.",
    ),
    case(
        "U05-hi-name-exp-pay-city", "hi", ["utterance", "name", "experience", "pay", "city", "skills"],
        "मेरा नाम राहुल शर्मा है। मुझे पाँच साल का प्लंबिंग का अनुभव है। मैं मुंबई में रहता हूँ और मुझे पंद्रह हजार रुपये चाहिए।",
        full_name="राहुल शर्मा", experience_years=5, expected_pay=15000, city=MUMBAI, skills=[PLUMBING],
    ),
    case(
        "U06-hi-painter-saat-sau", "hi", ["utterance", "name", "pay", "skills", "grounding"],
        "मेरा नाम अमित कुमार है। मैं पेंटर हूँ। मुझे सात सौ रुपये रोज चाहिए।",
        full_name="अमित कुमार", experience_years=None, expected_pay=700, city=None, skills=[PAINTING],
    ),
    case(
        "U07-en-full", "en", ["utterance", "name", "experience", "pay", "city", "skills"],
        "My name is Rahul Sharma. I have 4 years experience as a plumber. I want 700 rupees per day. I live in Pune.",
        full_name="Rahul Sharma", experience_years=4, expected_pay=700, city=PUNE, skills=[PLUMBING],
    ),
    case(
        "U08-en-carpenter-nopay", "en", ["utterance", "name", "experience", "city", "skills", "grounding"],
        "My name is Sameer Pal. I am a carpenter in Mumbai with 10 years of experience.",
        full_name="Sameer Pal", experience_years=10, expected_pay=None, city=MUMBAI, skills=[CARPENTRY],
    ),
    case(
        "U09-codemix-mr-en", "code_mixed", ["utterance", "name", "experience", "pay", "city", "skills", "code_mixed"],
        "माझं नाव समीर पाल आहे. मी 4 years experience असलेला plumber आहे. मला 700 rupees daily पाहिजे. मी कोल्हापूरमध्ये राहतो.",
        full_name="समीर पाल", experience_years=4, expected_pay=700, city=KOLHAPUR, skills=[PLUMBING],
    ),
    case(
        "U10-codemix-painter-rate", "code_mixed", ["utterance", "pay", "city", "skills", "code_mixed", "grounding"],
        "मी Pune मध्ये काम शोधत आहे. मी painter आहे आणि माझा rate 800 rupees per day आहे.",
        full_name=None, experience_years=None, expected_pay=800, city=PUNE, skills=[PAINTING],
        notes="No name and no experience stated - both must stay null.",
    ),
    case(
        "U11-codemix-hi-electrician", "code_mixed", ["utterance", "name", "experience", "pay", "city", "skills", "code_mixed"],
        "मेरा नाम अमित कुमार है, मुझे 5 years experience है electrician के तौर पर, मैं Nagpur में रहता हूँ और मुझे 15,000 rupees salary चाहिए।",
        full_name="अमित कुमार", experience_years=5, expected_pay=15000, city=NAGPUR, skills=[ELECTRICAL],
        notes="Mirrors the shape of a real stored transcript that extracted correctly on 2026-09-30.",
    ),
]

# --------------------------------------------------------------------------
# B. Grounding cases - the transcript states no number at all.
# --------------------------------------------------------------------------

GROUNDING = [
    case(
        "G01-en-plumber-only", "en", ["grounding", "skills"],
        "I am a plumber and I am looking for work.",
        full_name=None, experience_years=None, expected_pay=None, city=None, skills=[PLUMBING],
    ),
    case(
        "G02-mr-plumbing-only", "mr", ["grounding", "skills", "experience"],
        "मी प्लंबिंगचं काम करतो.",
        full_name=None, experience_years=None, expected_pay=None, city=None, skills=[PLUMBING],
        notes="The 'no experience number' case required by the evaluation spec.",
    ),
    case(
        "G03-mr-city-only", "mr", ["grounding", "city"],
        "मला पुण्यात काम पाहिजे.",
        full_name=None, experience_years=None, expected_pay=None, city=PUNE, skills=None,
        notes="'पुण्यात' is the inflected spoken form; any Pune surface form is accepted.",
    ),
    case(
        "G04-mr-trade-only", "mr", ["grounding", "skills"],
        "मी सुतार आहे.",
        full_name=None, experience_years=None, expected_pay=None, city=None, skills=[CARPENTRY],
    ),
]

# --------------------------------------------------------------------------
# C. Pay probes - the exact phrasings from the evaluation spec.
#
# Each phrasing is tested TWICE: once as the bare phrase (as specified)
# and once inside a minimal natural sentence. A bare fragment states no
# claim to be paid, so a null there could mean either "could not parse the
# number" or "no pay was being claimed"; the sentence form separates those
# two explanations instead of leaving them confounded.
# --------------------------------------------------------------------------

_PAY_PHRASES = [
    ("P01-satashe", "mr", "सातशे रुपये", 700, "मला सातशे रुपये पाहिजे."),
    ("P02-satashe-roj", "mr", "सातशे रुपये रोज", 700, "मला सातशे रुपये रोज पाहिजे."),
    ("P03-saat-sau", "hi", "सात सौ रुपये", 700, "मुझे सात सौ रुपये चाहिए।"),
    ("P04-devanagari-700", "mr", "७०० रुपये", 700, "मला ७०० रुपये पाहिजे."),
    ("P05-ascii-700-mr", "mr", "700 रुपये", 700, "मला 700 रुपये पाहिजे."),
    ("P06-700-rupees-en", "en", "700 rupees", 700, "I want 700 rupees."),
    ("P07-aathshe-roj", "mr", "आठशे रुपये रोज", 800, "मला आठशे रुपये रोज पाहिजे."),
    ("P08-pandhra-hajar", "mr", "पंधरा हजार रुपये", 15000, "मला पंधरा हजार रुपये पाहिजे."),
    ("P09-15000-comma", "mr", "15,000 रुपये", 15000, "मला 15,000 रुपये पाहिजे."),
    ("P10-devanagari-15000", "mr", "१५,००० रुपये", 15000, "मला १५,००० रुपये पाहिजे."),
]

PAY_PROBES: List[Dict[str, Any]] = []
for probe_id, lang, phrase, expected_value, sentence in _PAY_PHRASES:
    PAY_PROBES.append(
        case(
            f"{probe_id}-bare", lang, ["pay", "pay_bare"], phrase,
            expected_pay=expected_value, experience_years=None, full_name=None, city=None, skills=None,
            notes=f"Bare phrase exactly as listed in the evaluation spec. Pay phrase under test: {phrase}",
        )
    )
    PAY_PROBES.append(
        case(
            f"{probe_id}-sentence", lang, ["pay", "pay_sentence"], sentence,
            expected_pay=expected_value, experience_years=None, full_name=None, city=None, skills=None,
            notes=f"Same pay phrase inside a minimal natural sentence. Pay phrase under test: {phrase}",
        )
    )

# --------------------------------------------------------------------------
# D. Experience probes - the exact phrasings from the evaluation spec.
# --------------------------------------------------------------------------

_EXPERIENCE_PHRASES = [
    ("E01-chaar-varsh", "mr", "चार वर्षांचा अनुभव", 4),
    ("E02-devanagari-4", "mr", "४ वर्षांचा अनुभव", 4),
    ("E03-4-years-en", "en", "4 years experience", 4),
    ("E04-paach-varshanpasun", "mr", "पाच वर्षांपासून काम करतो", 5),
    ("E05-5-years-codemix", "code_mixed", "5 years experience आहे", 5),
    ("E06-daha-varsh", "mr", "दहा वर्षांचा अनुभव", 10),
]

EXPERIENCE_PROBES = [
    case(
        f"{probe_id}-bare", lang, ["experience", "experience_bare"], phrase,
        experience_years=expected_value, expected_pay=None, full_name=None, city=None, skills=SKIP,
        notes=f"Bare phrase exactly as listed in the evaluation spec. skills not scored: '{phrase}' names no trade but mentions work.",
    )
    for probe_id, lang, phrase, expected_value in _EXPERIENCE_PHRASES
]

# --------------------------------------------------------------------------
# E. Pay-context probes.
#
# Added after the first run, which showed something the earlier diagnosis
# had missed: "मला सातशे रुपये रोज पाहिजे." on its own extracts correctly as
# 700, but the SAME sentence inside the longer U01 utterance extracts as
# 7000. These probes vary one thing at a time around U01 to find what
# actually triggers the 10x error. They are labelled like any other case.
# --------------------------------------------------------------------------

PAY_CONTEXT_PROBES = [
    case(
        "C01-exp-plus-pay", "mr", ["pay", "pay_context"],
        "मला चार वर्षांचा अनुभव आहे. मला सातशे रुपये रोज पाहिजे.",
        experience_years=4, expected_pay=700, full_name=None, city=None, skills=None,
        notes="U01 minus the name and city sentences.",
    ),
    case(
        "C02-name-plus-pay", "mr", ["pay", "pay_context"],
        "माझं नाव समीर पाल आहे. मला सातशे रुपये रोज पाहिजे.",
        full_name="समीर पाल", expected_pay=700, experience_years=None, city=None, skills=None,
        notes="U01 minus the experience and city sentences.",
    ),
    case(
        "C03-pay-plus-city", "mr", ["pay", "pay_context"],
        "मला सातशे रुपये रोज पाहिजे. मी कोल्हापूरमध्ये राहतो.",
        expected_pay=700, city=KOLHAPUR, full_name=None, experience_years=None, skills=None,
        notes="U01 minus the name and experience sentences.",
    ),
    case(
        "C04-u01-with-ascii-digits", "mr", ["pay", "pay_context"],
        "माझं नाव समीर पाल आहे. मला चार वर्षांचा अनुभव आहे. मला 700 रुपये रोज पाहिजे. मी कोल्हापूरमध्ये राहतो.",
        full_name="समीर पाल", experience_years=4, expected_pay=700, city=KOLHAPUR, skills=None,
        notes="U01 with the pay written as digits instead of the number word सातशे.",
    ),
    case(
        "C05-u01-pay-last", "mr", ["pay", "pay_context"],
        "माझं नाव समीर पाल आहे. मला चार वर्षांचा अनुभव आहे. मी कोल्हापूरमध्ये राहतो. मला सातशे रुपये रोज पाहिजे.",
        full_name="समीर पाल", experience_years=4, expected_pay=700, city=KOLHAPUR, skills=None,
        notes="U01 with the pay sentence moved to the end - tests sentence position.",
    ),
    case(
        "C06-u01-aathshe", "mr", ["pay", "pay_context"],
        "माझं नाव समीर पाल आहे. मला चार वर्षांचा अनुभव आहे. मला आठशे रुपये रोज पाहिजे. मी कोल्हापूरमध्ये राहतो.",
        full_name="समीर पाल", experience_years=4, expected_pay=800, city=KOLHAPUR, skills=None,
        notes="U01 with आठशे (800) instead of सातशे - tests whether the word itself matters.",
    ),
]

PAY_CONTEXT_PROBES += [
    case(
        "C07-city-then-pay", "mr", ["pay", "pay_context"],
        "मी कोल्हापूरमध्ये राहतो. मला सातशे रुपये रोज पाहिजे.",
        expected_pay=700, city=KOLHAPUR, full_name=None, experience_years=None, skills=None,
        notes="Same two sentences as C03 but in the opposite order - isolates 'something precedes the pay sentence'.",
    ),
    case(
        "C08-pay-then-exp", "mr", ["pay", "pay_context"],
        "मला सातशे रुपये रोज पाहिजे. मला चार वर्षांचा अनुभव आहे.",
        expected_pay=700, experience_years=4, full_name=None, city=None, skills=None,
        notes="Same two sentences as C01 but in the opposite order.",
    ),
    case(
        "C09-name-then-pay-no-roj", "mr", ["pay", "pay_context"],
        "माझं नाव समीर पाल आहे. मला सातशे रुपये पाहिजे.",
        full_name="समीर पाल", expected_pay=700, experience_years=None, city=None, skills=None,
        notes="C02 without रोज - checks whether the daily-rate word is part of the trigger.",
    ),
]

PAY_CONTEXT_PROBES += [
    case(
        "C10-name-then-pandhra-hajar", "mr", ["pay", "pay_context", "pay_context_extra"],
        "माझं नाव समीर पाल आहे. मला पंधरा हजार रुपये पाहिजे.",
        full_name="समीर पाल", expected_pay=15000, experience_years=None, city=None, skills=None,
        notes="Same frame as C09 with a different Marathi number word - tests whether the trigger is number words generally or सातशे specifically.",
    ),
    case(
        "C11-name-then-saat-sau", "hi", ["pay", "pay_context", "pay_context_extra"],
        "मेरा नाम समीर पाल है। मुझे सात सौ रुपये चाहिए।",
        full_name="समीर पाल", expected_pay=700, experience_years=None, city=None, skills=None,
        notes="Same frame as C09 but the Hindi wording for 700 - tests whether the value 700 or the word सातशे is the trigger.",
    ),
]


# --------------------------------------------------------------------------
# F. Name-preservation and Marathi pay probes.
#
# Added after a real session where the speaker said "Swarup Samir Pal" and
# the profile showed only "समीर पाल". These check that a complete
# multi-word name survives in every supported language, and that Marathi
# number words map to the right amount.
# --------------------------------------------------------------------------

NAME_CASES = [
    case(
        "N01-en-three-part", "en", ["name", "name_probe"],
        "My name is Swarup Samir Pal.",
        full_name="Swarup Samir Pal", experience_years=None, expected_pay=None, city=None, skills=None,
    ),
    case(
        "N02-mr-three-part", "mr", ["name", "name_probe"],
        "माझं नाव स्वरूप समीर पाल आहे.",
        full_name="स्वरूप समीर पाल", experience_years=None, expected_pay=None, city=None, skills=None,
    ),
    case(
        "N03-hi-three-part", "hi", ["name", "name_probe"],
        "मेरा नाम स्वरूप समीर पाल है।",
        full_name="स्वरूप समीर पाल", experience_years=None, expected_pay=None, city=None, skills=None,
    ),
    case(
        "N04-codemix-latin-name", "code_mixed", ["name", "name_probe", "code_mixed"],
        "माझं नाव Swarup Samir Pal आहे.",
        full_name="Swarup Samir Pal", experience_years=None, expected_pay=None, city=None, skills=None,
    ),
    case(
        "N05-mr-four-part", "mr", ["name", "name_probe"],
        "माझं नाव स्वरूप समीर पाल पाटील आहे.",
        full_name="स्वरूप समीर पाल पाटील", experience_years=None, expected_pay=None, city=None, skills=None,
        notes="Four-part name - must not be truncated to the last two words.",
    ),
    case(
        "N06-mr-name-and-pay", "mr", ["name", "pay", "name_probe"],
        "माझं नाव स्वरूप समीर पाल आहे. मला दहा हजार रुपये रोज पाहिजे.",
        full_name="स्वरूप समीर पाल", expected_pay=10000, experience_years=None, city=None, skills=None,
        notes="The Step-4 reference case: full name plus a Marathi number word.",
    ),
]

PAY_WORD_CASES = [
    case(
        "W01-mr-daha-hajar", "mr", ["pay", "pay_word"],
        "मला दहा हजार रुपये पाहिजे.",
        expected_pay=10000, experience_years=None, full_name=None, city=None, skills=None,
    ),
    case(
        "W02-mr-daha-hajar-roj", "mr", ["pay", "pay_word"],
        "मला दहा हजार रुपये रोज पाहिजे.",
        expected_pay=10000, experience_years=None, full_name=None, city=None, skills=None,
    ),
    case(
        "W03-mr-aathshe", "mr", ["pay", "pay_word"],
        "मला आठशे रुपये पाहिजे.",
        expected_pay=800, experience_years=None, full_name=None, city=None, skills=None,
    ),
    case(
        "W04-hi-aath-sau", "hi", ["pay", "pay_word"],
        "मुझे आठ सौ रुपये चाहिए।",
        expected_pay=800, experience_years=None, full_name=None, city=None, skills=None,
    ),
    case(
        "W05-en-eight-hundred", "en", ["pay", "pay_word"],
        "I want eight hundred rupees.",
        expected_pay=800, experience_years=None, full_name=None, city=None, skills=None,
    ),
    case(
        "W06-hi-pandrah-hajar", "hi", ["pay", "pay_word"],
        "मुझे पंद्रह हजार रुपये चाहिए।",
        expected_pay=15000, experience_years=None, full_name=None, city=None, skills=None,
    ),
    case(
        "W07-no-pay-stated", "mr", ["pay", "pay_word", "grounding"],
        "माझं नाव स्वरूप समीर पाल आहे. मी इलेक्ट्रिशियन आहे.",
        full_name="स्वरूप समीर पाल", expected_pay=None, experience_years=None, city=None,
        skills=[ELECTRICAL],
        notes="No pay stated - expectedPay must stay null, never estimated from the trade.",
    ),
    case(
        "W08-real-garbled-session", "mr", ["pay", "pay_word", "grounding", "real_transcript"],
        "माजा नावस बरूप समीर पाल आहे मी गेले धावर्ष जलो इलेक्टरिशिंची काम करते हैं "
        "माजा पी हा आच्छे रूपे एट हंडेट रूपीज आहे",
        expected_pay=None, experience_years=None, full_name=SKIP, city=None, skills=SKIP,
        notes=(
            "The exact Whisper output from the reported session. Speech-to-text "
            "destroyed both numbers, so no pay or experience can honestly be "
            "recovered - both must be null rather than guessed. fullName is not "
            "scored: 'स्वरूप' was garbled into 'नावस बरूप' before extraction ever "
            "ran, so there is no correct answer to assert."
        ),
    ),
]

ALL_CASES: List[Dict[str, Any]] = (
    UTTERANCES + GROUNDING + PAY_PROBES + EXPERIENCE_PROBES + PAY_CONTEXT_PROBES + NAME_CASES + PAY_WORD_CASES
)

# Cases re-run to confirm the extractor is deterministic (greedy decoding).
DETERMINISM_CASE_IDS = ["U01-mr-name-exp-pay-city", "P02-satashe-roj-sentence", "G02-mr-plumbing-only"]


def get_cases(tag: Optional[str] = None) -> List[Dict[str, Any]]:
    if tag is None:
        return list(ALL_CASES)
    return [c for c in ALL_CASES if tag in c["tags"]]
