from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.auth import verify_api_key
from app.sarvam.errors import AiServiceUnavailableError
from app.skills.models import CatalogSkillEntry, SkillResolutionResult
from app.skills.semantic_resolver import resolve_skills_semantically

router = APIRouter()


class SkillResolveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    transcript: str = ""
    raw_skills: List[str] = Field(alias="rawSkills", min_length=1)
    catalog: List[CatalogSkillEntry]


class SkillResolveResponse(BaseModel):
    results: List[SkillResolutionResult]


@router.post(
    "/skills/resolve",
    response_model=SkillResolveResponse,
    dependencies=[Depends(verify_api_key)],
)
async def resolve_skills(request: SkillResolveRequest) -> SkillResolveResponse:
    """
    Stage 2 semantic skill resolution - only called by Node for raw skill
    phrases its own deterministic normalization (Stage 1: exact multilingual
    name match, then a small alias table) could not already resolve. Thin
    HTTP boundary only; all logic lives in app/skills/semantic_resolver.py.
    Node owns the final acceptance decision (confidence threshold) before
    ever persisting a WorkerSkill - this endpoint only reports what the
    local LLM selected from the supplied catalog.
    """

    try:
        results = await resolve_skills_semantically(request.transcript, request.raw_skills, request.catalog)
    except AiServiceUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return SkillResolveResponse(results=results)
