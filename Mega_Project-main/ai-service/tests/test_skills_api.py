from fastapi.testclient import TestClient

from app.extraction.local_llm_runtime import LocalLLMRuntime
from app.main import app
from app.sarvam.errors import AiServiceUnavailableError

client = TestClient(app)

CATALOG_PAYLOAD = [
    {"id": "SKILL_PLUMBING", "name": {"en": "Plumbing", "hi": "प्लंबिंग", "mr": "प्लंबिंग"}},
    {"id": "SKILL_MASONRY", "name": {"en": "Masonry", "hi": "राजमिस्त्री", "mr": "गवंडीकाम"}},
]


def test_resolve_skills_success(monkeypatch):
    import json

    monkeypatch.setattr(
        LocalLLMRuntime,
        "generate",
        lambda *a, **kw: json.dumps(
            [
                {
                    "rawSkill": "plumber",
                    "resolved": True,
                    "canonicalSkillId": "SKILL_PLUMBING",
                    "canonicalSkillName": "Plumbing",
                    "confidence": 0.9,
                    "reason": "matches",
                }
            ]
        ),
    )

    response = client.post(
        "/skills/resolve",
        json={"transcript": "मी plumber आहे", "rawSkills": ["plumber"], "catalog": CATALOG_PAYLOAD},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["results"][0]["canonicalSkillId"] == "SKILL_PLUMBING"


def test_resolve_skills_requires_at_least_one_raw_skill():
    response = client.post("/skills/resolve", json={"transcript": "x", "rawSkills": [], "catalog": CATALOG_PAYLOAD})

    assert response.status_code == 422


def test_resolve_skills_service_unavailable_returns_503(monkeypatch):
    def raise_unavailable(*a, **kw):
        raise AiServiceUnavailableError("mlx-lm is not available")

    monkeypatch.setattr(LocalLLMRuntime, "generate", raise_unavailable)

    response = client.post(
        "/skills/resolve",
        json={"transcript": "x", "rawSkills": ["plumber"], "catalog": CATALOG_PAYLOAD},
    )

    assert response.status_code == 503


def test_resolve_skills_requires_api_key_when_configured(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "secret123")

    response = client.post(
        "/skills/resolve",
        json={"transcript": "x", "rawSkills": ["plumber"], "catalog": CATALOG_PAYLOAD},
    )

    assert response.status_code == 401
