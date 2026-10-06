"""
The production Whisper configuration must carry the evaluated domain prompt,
and that prompt must stay generic - it may name the KINDS of words the audio
contains, never a specific worker's answers.
"""

from app.voice.mlx_whisper_stt import MARATHI_DOMAIN_INITIAL_PROMPT


def test_prompt_is_actually_passed_to_mlx_whisper(monkeypatch):
    """Guards against the prompt existing as a constant nobody uses."""
    import sys
    import types

    captured = {}

    def fake_transcribe(path, **kwargs):
        captured.update(kwargs)
        return {"text": "ठीक आहे"}

    whisper = types.ModuleType("mlx_whisper")
    whisper.transcribe = fake_transcribe
    monkeypatch.setitem(sys.modules, "mlx_whisper", whisper)
    monkeypatch.setattr(
        "app.voice.mlx_whisper_stt._ensure_model_cached", lambda model_name: None
    )

    from app.voice.mlx_whisper_stt import MLXWhisperSTT

    text, confidence = MLXWhisperSTT()._transcribe_sync("/tmp/whatever.wav", "mr")

    assert text == "ठीक आहे"
    assert confidence is None
    assert captured["initial_prompt"] == MARATHI_DOMAIN_INITIAL_PROMPT
    # The decoding settings that were deliberately NOT changed.
    assert captured["task"] == "transcribe"
    assert captured["language"] == "mr"
    assert captured["word_timestamps"] is False


def test_prompt_contains_no_user_specific_or_answer_specific_text():
    forbidden = [
        "स्वरूप", "समीर", "पाल", "Swarup", "Samir", "Pal",   # a real worker's name
        "माझं नाव", "मला पाच", "वर्षांचा अनुभव",              # answer-shaped phrasing
        "800", "८००", "आठशी", "अठशे",                        # a specific expected answer
    ]
    for token in forbidden:
        assert token not in MARATHI_DOMAIN_INITIAL_PROMPT, f"prompt must not contain {token!r}"


def test_prompt_is_a_short_domain_hint_not_a_vocabulary_dump():
    assert len(MARATHI_DOMAIN_INITIAL_PROMPT) < 400
    assert MARATHI_DOMAIN_INITIAL_PROMPT.count(",") < 25


def test_prompt_names_the_domain_categories_it_is_meant_to_bias():
    for expected in ["रक्कम", "कामे", "आठशे", "इलेक्ट्रिशियन", "रुपये"]:
        assert expected in MARATHI_DOMAIN_INITIAL_PROMPT
