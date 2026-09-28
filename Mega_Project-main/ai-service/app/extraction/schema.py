"""
JSON Schema sent to Sarvam's chat completions endpoint via
response_format={"type": "json_schema", "json_schema": {"schema": ..., "strict": True}}.

Deliberately a hand-written plain dict, NOT derived from the
ExtractedProfile Pydantic model via .model_json_schema() - Pydantic v2
emits `anyOf:[{type:"string"},{type:"null"}]` for optional fields, while
Sarvam's strict mode (OpenAI-compatible) is proven to work against the
`type:["string","null"]` array-type-union form (verified in the earlier
Node/Gemini-to-Sarvam migration). Keeping the JSON Schema and the Pydantic
model as two independently-authored artifacts describing the same contract
mirrors exactly how the removed backend2/voiceExtractionSchema.js kept its
JSON Schema and Zod schema separate.

Strict mode requires every property to be listed in `required`; a field the
speaker never mentioned is expressed as a `null` value, not an absent key -
this is what "do not hallucinate missing information" is enforced by,
structurally, not just asked for in the prompt.

skills and preferred_job_categories are free-text names, not catalog IDs -
mapping them to real Skill/JobCategory documents was explicitly out of
scope for the original migration and remains so here.
"""

EXTRACTED_PROFILE_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "fullName": {"type": ["string", "null"]},
        "experienceYears": {"type": ["number", "null"]},
        "expectedPay": {"type": ["number", "null"]},
        "skills": {
            "type": ["array", "null"],
            "items": {"type": "string"},
        },
        "city": {"type": ["string", "null"]},
        "bio": {"type": ["string", "null"]},
        "availability": {
            "type": ["string", "null"],
            "enum": ["available", "busy", "unavailable", None],
        },
        "languages": {
            "type": ["array", "null"],
            "items": {"type": "string", "enum": ["mr", "hi", "en"]},
        },
        "preferredJobCategories": {
            "type": ["array", "null"],
            "items": {"type": "string"},
        },
    },
    "required": [
        "fullName",
        "experienceYears",
        "expectedPay",
        "skills",
        "city",
        "bio",
        "availability",
        "languages",
        "preferredJobCategories",
    ],
    "additionalProperties": False,
}
