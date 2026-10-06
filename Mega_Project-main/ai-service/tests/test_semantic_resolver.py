import asyncio
import json

import pytest

from app.extraction.local_llm_runtime import LocalLLMRuntime
from app.skills.models import CatalogSkillEntry
from app.skills.semantic_resolver import resolve_skills_semantically

CATALOG = [
    CatalogSkillEntry(id="SKILL_PLUMBING", name={"en": "Plumbing", "hi": "प्लंबिंग", "mr": "प्लंबिंग"}),
    CatalogSkillEntry(id="SKILL_MASONRY", name={"en": "Masonry", "hi": "राजमिस्त्री", "mr": "गवंडीकाम"}),
    CatalogSkillEntry(id="SKILL_CARPENTRY", name={"en": "Carpentry", "hi": "बढ़ईगीरी", "mr": "सुतारकाम"}),
]


def _patch_llm(monkeypatch, response_obj):
    def fake_generate(system_prompt, user_content, max_tokens=512):
        return json.dumps(response_obj)

    monkeypatch.setattr(LocalLLMRuntime, "generate", fake_generate)


# 4. "नळ दुरुस्तीचं काम" → Plumbing through semantic resolver
def test_resolves_semantic_marathi_phrase_to_correct_skill(monkeypatch):
    _patch_llm(
        monkeypatch,
        [
            {
                "rawSkill": "नळ दुरुस्तीचं काम",
                "resolved": True,
                "canonicalSkillId": "SKILL_PLUMBING",
                "canonicalSkillName": "Plumbing",
                "confidence": 0.92,
                "reason": "Pipe repair work is plumbing.",
            }
        ],
    )

    results = asyncio.run(
        resolve_skills_semantically("मी नळ दुरुस्तीचं काम करतो.", ["नळ दुरुस्तीचं काम"], CATALOG)
    )

    assert len(results) == 1
    assert results[0].resolved is True
    assert results[0].canonical_skill_id == "SKILL_PLUMBING"
    assert results[0].canonical_skill_name == "Plumbing"
    assert results[0].confidence == 0.92


# 11. invalid/non-catalog Skill ObjectId must be rejected
# 12. no hallucinated skills
def test_hallucinated_id_not_in_catalog_is_rejected(monkeypatch):
    _patch_llm(
        monkeypatch,
        [
            {
                "rawSkill": "electrician",
                "resolved": True,
                "canonicalSkillId": "SKILL_ELECTRICIAN_MADE_UP",
                "canonicalSkillName": "Electrician",
                "confidence": 0.99,
                "reason": "Fabricated - this id does not exist in the catalog.",
            }
        ],
    )

    results = asyncio.run(resolve_skills_semantically("मी electrician आहे.", ["electrician"], CATALOG))

    assert results[0].resolved is False
    assert results[0].canonical_skill_id is None
    assert results[0].canonical_skill_name is None


# 7. unrelated skill → must NOT resolve to an unrelated catalog skill
def test_llm_explicitly_returning_unresolved_is_honored(monkeypatch):
    _patch_llm(
        monkeypatch,
        [
            {
                "rawSkill": "deep sea diving",
                "resolved": False,
                "canonicalSkillId": None,
                "canonicalSkillName": None,
                "confidence": 0.0,
                "reason": "No catalog skill matches deep sea diving.",
            }
        ],
    )

    results = asyncio.run(resolve_skills_semantically("transcript", ["deep sea diving"], CATALOG))

    assert results[0].resolved is False
    assert results[0].canonical_skill_id is None


# 8. "electrician" when Electrician is absent → unresolved (empty catalog variant)
def test_empty_catalog_never_calls_the_llm_and_everything_is_unresolved(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("LLM must not be called when the catalog is empty")

    monkeypatch.setattr(LocalLLMRuntime, "generate", fail_if_called)

    results = asyncio.run(resolve_skills_semantically("transcript", ["electrician"], []))

    assert results[0].resolved is False
    assert results[0].reason == "Catalog is empty."


def test_empty_raw_skills_returns_empty_without_calling_the_llm(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("LLM must not be called with no raw skills")

    monkeypatch.setattr(LocalLLMRuntime, "generate", fail_if_called)

    results = asyncio.run(resolve_skills_semantically("transcript", [], CATALOG))

    assert results == []


# 13. multiple extracted skills
def test_multiple_raw_skills_resolved_in_one_call(monkeypatch):
    _patch_llm(
        monkeypatch,
        [
            {
                "rawSkill": "नळ दुरुस्तीचं काम",
                "resolved": True,
                "canonicalSkillId": "SKILL_PLUMBING",
                "canonicalSkillName": "Plumbing",
                "confidence": 0.9,
                "reason": "plumbing",
            },
            {
                "rawSkill": "लाकडी काम",
                "resolved": True,
                "canonicalSkillId": "SKILL_CARPENTRY",
                "canonicalSkillName": "Carpentry",
                "confidence": 0.85,
                "reason": "woodwork",
            },
        ],
    )

    results = asyncio.run(
        resolve_skills_semantically("transcript", ["नळ दुरुस्तीचं काम", "लाकडी काम"], CATALOG)
    )

    assert len(results) == 2
    assert {r.canonical_skill_id for r in results} == {"SKILL_PLUMBING", "SKILL_CARPENTRY"}


def test_raw_skill_missing_from_llm_output_is_not_silently_dropped(monkeypatch):
    _patch_llm(
        monkeypatch,
        [
            {
                "rawSkill": "नळ दुरुस्तीचं काम",
                "resolved": True,
                "canonicalSkillId": "SKILL_PLUMBING",
                "canonicalSkillName": "Plumbing",
                "confidence": 0.9,
                "reason": "plumbing",
            }
        ],
    )

    results = asyncio.run(resolve_skills_semantically("transcript", ["नळ दुरुस्तीचं काम", "mystery skill"], CATALOG))

    assert len(results) == 2
    mystery = next(r for r in results if r.raw_skill == "mystery skill")
    assert mystery.resolved is False


def test_malformed_llm_output_treated_as_fully_unresolved_not_a_crash(monkeypatch):
    monkeypatch.setattr(LocalLLMRuntime, "generate", lambda *a, **kw: "not valid json at all")

    results = asyncio.run(resolve_skills_semantically("transcript", ["plumber"], CATALOG))

    assert len(results) == 1
    assert results[0].resolved is False


def test_confidence_is_clamped_to_valid_range(monkeypatch):
    _patch_llm(
        monkeypatch,
        [
            {
                "rawSkill": "plumber",
                "resolved": True,
                "canonicalSkillId": "SKILL_PLUMBING",
                "canonicalSkillName": "Plumbing",
                "confidence": 5.0,  # out of [0,1] range
                "reason": "overclaimed confidence",
            }
        ],
    )

    results = asyncio.run(resolve_skills_semantically("transcript", ["plumber"], CATALOG))

    assert results[0].confidence == 1.0


def test_non_numeric_confidence_defaults_to_zero(monkeypatch):
    _patch_llm(
        monkeypatch,
        [
            {
                "rawSkill": "plumber",
                "resolved": True,
                "canonicalSkillId": "SKILL_PLUMBING",
                "canonicalSkillName": "Plumbing",
                "confidence": "high",
                "reason": "non-numeric confidence",
            }
        ],
    )

    results = asyncio.run(resolve_skills_semantically("transcript", ["plumber"], CATALOG))

    assert results[0].confidence == 0.0


def test_json_wrapped_in_markdown_fence_is_still_parsed(monkeypatch):
    payload = [
        {
            "rawSkill": "plumber",
            "resolved": True,
            "canonicalSkillId": "SKILL_PLUMBING",
            "canonicalSkillName": "Plumbing",
            "confidence": 0.8,
            "reason": "ok",
        }
    ]
    monkeypatch.setattr(LocalLLMRuntime, "generate", lambda *a, **kw: f"```json\n{json.dumps(payload)}\n```")

    results = asyncio.run(resolve_skills_semantically("transcript", ["plumber"], CATALOG))

    assert results[0].canonical_skill_id == "SKILL_PLUMBING"
