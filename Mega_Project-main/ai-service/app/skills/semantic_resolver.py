import asyncio
import json
import logging
from typing import List, Optional

from app.extraction.local_llm_runtime import LocalLLMRuntime
from app.skills.models import CatalogSkillEntry, SkillResolutionResult

from app.runtime.inference_gate import run_exclusive

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_TEMPLATE = """You are resolving raw, free-text skill phrases - extracted from a voice transcript for a blue-collar job platform in India - against a FIXED catalog of real skills. The phrases may be in Marathi, Hindi, English, or a mix of these.

You may ONLY select a skill id from the catalog listed below. You must NEVER invent a skill, invent an id, or select a catalog skill that is not a genuine semantic match just to avoid an unresolved result. If nothing in the catalog is a real match for a phrase, mark it unresolved (resolved=false, canonicalSkillId=null).

CATALOG:
{catalog_listing}

For each raw skill phrase below, decide which catalog id (if any) it means - use the phrase itself and the surrounding transcript for context. Respond with ONLY a JSON array (no markdown fences, no commentary before or after it), one object per raw skill phrase, in exactly this shape:

[
  {{"rawSkill": "<the exact phrase>", "resolved": true or false, "canonicalSkillId": "<one of the catalog ids above, or null>", "canonicalSkillName": "<that catalog entry's English name, or null>", "confidence": 0.0 to 1.0, "reason": "short reason"}}
]"""


def _build_catalog_listing(catalog: List[CatalogSkillEntry]) -> str:
    return "\n".join(
        f'- id="{entry.id}": {entry.name.en} / {entry.name.hi} / {entry.name.mr}' for entry in catalog
    )


def _extract_json_array(text: str) -> str:
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end < start:
        return text
    return text[start : end + 1]


def _unresolved(raw: str, reason: str) -> SkillResolutionResult:
    return SkillResolutionResult(
        rawSkill=raw, resolved=False, canonicalSkillId=None, canonicalSkillName=None, confidence=0.0, reason=reason
    )


async def resolve_skills_semantically(
    transcript: str,
    raw_skills: List[str],
    catalog: List[CatalogSkillEntry],
) -> List[SkillResolutionResult]:
    """
    Resolves raw skill phrases against the real Skill catalog via the local
    LLM (shared LocalLLMRuntime, same model used for profile extraction) -
    only called for phrases the deterministic normalization layer (Node,
    Stage 1) could not already match by exact name or alias.

    The LLM is a SELECTOR over the supplied catalog, never a free
    generator: any `canonicalSkillId` it returns that is not one of the ids
    actually present in `catalog` is rejected here unconditionally, no
    matter what confidence the LLM claims for it. This is the enforcement
    point for "never invent a skill / never invent an id."
    """

    if not raw_skills:
        return []

    if not catalog:
        # Nothing to select from - every phrase is trivially unresolved;
        # no reason to spend an LLM call on it.
        return [_unresolved(raw, "Catalog is empty.") for raw in raw_skills]

    valid_ids = {entry.id for entry in catalog}
    id_to_name = {entry.id: entry.name.en for entry in catalog}

    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(catalog_listing=_build_catalog_listing(catalog))
    user_content = (
        f"Transcript (for context only):\n{transcript}\n\n"
        "Raw skill phrases to resolve:\n" + "\n".join(f"- {raw}" for raw in raw_skills)
    )

    raw_output = await run_exclusive(
        "qwen.resolve_skills",
        lambda: asyncio.to_thread(LocalLLMRuntime.generate, system_prompt, user_content, 768),
    )

    parsed: list = []
    try:
        candidate = json.loads(_extract_json_array(raw_output))
        if isinstance(candidate, list):
            parsed = candidate
        else:
            logger.warning("Semantic skill resolver returned a non-array JSON value.")
    except json.JSONDecodeError:
        logger.warning("Semantic skill resolver returned unparseable output.")

    results_by_raw = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        raw = item.get("rawSkill")
        if not isinstance(raw, str):
            continue

        canonical_id: Optional[str] = item.get("canonicalSkillId")
        if canonical_id not in valid_ids:
            # Covers both "LLM said null" (legitimately unresolved) and
            # "LLM invented/hallucinated an id" (rejected regardless of
            # its claimed confidence) - neither is trusted past this point.
            reason = "No catalog match." if not canonical_id else "LLM returned an id not present in the supplied catalog - rejected."
            results_by_raw[raw] = _unresolved(raw, reason)
            continue

        try:
            confidence = float(item.get("confidence"))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        results_by_raw[raw] = SkillResolutionResult(
            rawSkill=raw,
            resolved=bool(item.get("resolved")),
            canonicalSkillId=canonical_id,
            canonicalSkillName=id_to_name[canonical_id],
            confidence=confidence,
            reason=str(item.get("reason") or ""),
        )

    # A raw phrase the LLM's output didn't mention at all stays unresolved,
    # never silently dropped from the response.
    return [
        results_by_raw.get(raw, _unresolved(raw, "No result returned by the resolver for this phrase."))
        for raw in raw_skills
    ]
