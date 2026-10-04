import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import Skill from "../src/models/skill.model.js";
import { resolveSkillsFromText, _internal } from "../src/utils/skillNormalization.js";

const { resolveDeterministic, SKILL_ALIASES } = _internal;

const FAKE_SKILLS = [
  { _id: "SKILL_PLUMBING", name: { en: "Plumbing", hi: "प्लंबिंग", mr: "प्लंबिंग" }, isActive: true },
  { _id: "SKILL_MASONRY", name: { en: "Masonry", hi: "राजमिस्त्री", mr: "गवंडीकाम" }, isActive: true },
];

function mockFetchOnce(handler) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = originalFetch;
  };
}

// =============================================================================
// STAGE 1 - deterministic resolution only (no network, no catalog query -
// calls resolveDeterministic directly against a fixed fake catalog array)
// =============================================================================

// 1. exact English skill
test("Stage 1: resolves an exact English catalog name", () => {
  const { resolved, unresolved } = resolveDeterministic(["Plumbing"], FAKE_SKILLS, SKILL_ALIASES);
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_PLUMBING");
  assert.deepStrictEqual(unresolved, []);
});

// 2. different capitalization
test("Stage 1: resolves regardless of capitalization and surrounding whitespace", () => {
  const { resolved } = resolveDeterministic(["  PLUMBING  "], FAKE_SKILLS, SKILL_ALIASES);
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_PLUMBING");
});

// 3. Hindi skill
test("Stage 1: resolves an exact Hindi catalog name", () => {
  const { resolved } = resolveDeterministic(["प्लंबिंग"], FAKE_SKILLS, SKILL_ALIASES);
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_PLUMBING");
});

// Marathi skill
test("Stage 1: resolves an exact Marathi catalog name", () => {
  const { resolved } = resolveDeterministic(["गवंडीकाम"], FAKE_SKILLS, SKILL_ALIASES);
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_MASONRY");
});

// 5. known alias
test("Stage 1: resolves a known occupation-word alias to its catalog trade-noun skill", () => {
  const { resolved } = resolveDeterministic(["plumber"], FAKE_SKILLS, SKILL_ALIASES);
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_PLUMBING");
});

test("Stage 1: resolves a Devanagari alias variant of a known occupation word", () => {
  const { resolved } = resolveDeterministic(["प्लंबर"], FAKE_SKILLS, SKILL_ALIASES);
  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_PLUMBING");
});

// multiple skills, duplicates
test("Stage 1: resolves multiple distinct skills and collapses duplicates", () => {
  const { resolved, unresolved } = resolveDeterministic(
    ["plumber", "Plumbing", "Masonry", "nonexistent trade"],
    FAKE_SKILLS,
    SKILL_ALIASES
  );
  assert.strictEqual(resolved.length, 2);
  assert.deepStrictEqual(unresolved, ["nonexistent trade"]);
});

// 9. ambiguous skill - no unambiguous alias entry, stays unresolved at Stage 1
test("Stage 1: an ambiguous bare word with no unambiguous alias entry is never guessed", () => {
  const { resolved, unresolved } = resolveDeterministic(["driver"], FAKE_SKILLS, SKILL_ALIASES);
  assert.deepStrictEqual(resolved, []);
  assert.deepStrictEqual(unresolved, ["driver"]);
});

test("Stage 1: empty/whitespace-only entries are skipped", () => {
  const { resolved, unresolved } = resolveDeterministic(["", "   ", "plumber"], FAKE_SKILLS, SKILL_ALIASES);
  assert.strictEqual(resolved.length, 1);
  assert.deepStrictEqual(unresolved, []);
});

// =============================================================================
// STAGE 2 integration - resolveSkillsFromText(), the full two-stage function
// =============================================================================

// 9. exact deterministic match must not call the semantic resolver
test("Stage 2 is never invoked when Stage 1 already resolved everything", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(() => {
    throw new Error("fetch must not be called when Stage 1 resolves everything");
  });
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved, unresolved } = await resolveSkillsFromText(["plumber"], "transcript");

  assert.strictEqual(resolved.length, 1);
  assert.deepStrictEqual(unresolved, []);
});

// 4. "नळ दुरुस्तीचं काम" → Plumbing through semantic resolver
test("Stage 2: a semantic Marathi phrase resolves via the local LLM resolver", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          rawSkill: "नळ दुरुस्तीचं काम",
          resolved: true,
          canonicalSkillId: "SKILL_PLUMBING",
          canonicalSkillName: "Plumbing",
          confidence: 0.9,
          reason: "semantic match",
        },
      ],
    }),
  }));
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved, unresolved } = await resolveSkillsFromText(
    ["नळ दुरुस्तीचं काम"],
    "मी नळ दुरुस्तीचं काम करतो."
  );

  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_PLUMBING");
  assert.deepStrictEqual(unresolved, []);
});

// 5. Hindi equivalent of a plumbing expression → Plumbing
test("Stage 2: a semantic Hindi phrase resolves via the local LLM resolver", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          rawSkill: "नल ठीक करने का काम",
          resolved: true,
          canonicalSkillId: "SKILL_PLUMBING",
          canonicalSkillName: "Plumbing",
          confidence: 0.88,
          reason: "Hindi for tap-repair work is plumbing",
        },
      ],
    }),
  }));
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved } = await resolveSkillsFromText(
    ["नल ठीक करने का काम"],
    "मुझे नल ठीक करने का काम आता है।"
  );

  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_PLUMBING");
});

// 6. Marathi + English code-switched transcript → correct skill
test("Stage 2: resolves correctly from a Marathi+English code-switched transcript", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async (url, options) => {
    const body = JSON.parse(options.body);
    // the full code-switched transcript is forwarded as context, unmodified
    assert.match(body.transcript, /5 years experience/);
    assert.match(body.transcript, /नळ दुरुस्ती/);
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            rawSkill: "नळ दुरुस्ती",
            resolved: true,
            canonicalSkillId: "SKILL_PLUMBING",
            canonicalSkillName: "Plumbing",
            confidence: 0.85,
            reason: "semantic match despite code-switching",
          },
        ],
      }),
    };
  });
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved } = await resolveSkillsFromText(
    ["नळ दुरुस्ती"],
    "माझं नाव राहुल आहे. मला 5 years experience आहे नळ दुरुस्ती मध्ये."
  );

  assert.strictEqual(resolved.length, 1);
  assert.strictEqual(resolved[0].id, "SKILL_PLUMBING");
});

// 7. unrelated skill must NOT resolve to an unrelated catalog skill (LLM says unresolved)
test("Stage 2: an unrelated skill the resolver marks unresolved stays unresolved", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          rawSkill: "deep sea diving",
          resolved: false,
          canonicalSkillId: null,
          canonicalSkillName: null,
          confidence: 0.0,
          reason: "no match",
        },
      ],
    }),
  }));
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved, unresolved } = await resolveSkillsFromText(["deep sea diving"], "transcript");

  assert.deepStrictEqual(resolved, []);
  assert.deepStrictEqual(unresolved, ["deep sea diving"]);
});

// 8. "electrician" when Electrician is absent → unresolved even through Stage 2
test("Stage 2: electrician stays unresolved when no Electrician skill exists, even via semantic resolver", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          rawSkill: "electrician",
          resolved: false,
          canonicalSkillId: null,
          canonicalSkillName: null,
          confidence: 0.0,
          reason: "No electrician skill in catalog",
        },
      ],
    }),
  }));
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved, unresolved } = await resolveSkillsFromText(["electrician"], "मी electrician आहे.");

  assert.deepStrictEqual(resolved, []);
  assert.deepStrictEqual(unresolved, ["electrician"]);
});

// 11. invalid/non-catalog Skill ObjectId must be rejected (defense-in-depth at the Node layer too)
test("Stage 2: a resolver result with an id not in the real catalog is rejected, never persisted", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          rawSkill: "electrician",
          resolved: true,
          canonicalSkillId: "SKILL_MADE_UP_NOT_IN_CATALOG",
          canonicalSkillName: "Electrician",
          confidence: 0.99,
          reason: "hallucinated",
        },
      ],
    }),
  }));
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved, unresolved } = await resolveSkillsFromText(["electrician"], "transcript");

  assert.deepStrictEqual(resolved, []);
  assert.deepStrictEqual(unresolved, ["electrician"]);
});

test("Stage 2: a result below the confidence threshold is rejected", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          rawSkill: "नळ दुरुस्तीचं काम",
          resolved: true,
          canonicalSkillId: "SKILL_PLUMBING",
          canonicalSkillName: "Plumbing",
          confidence: 0.4, // below SEMANTIC_CONFIDENCE_THRESHOLD (0.7)
          reason: "low confidence",
        },
      ],
    }),
  }));
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved, unresolved } = await resolveSkillsFromText(["नळ दुरुस्तीचं काम"], "transcript");

  assert.deepStrictEqual(resolved, []);
  assert.deepStrictEqual(unresolved, ["नळ दुरुस्तीचं काम"]);
});

test("Stage 2: AI service unavailable leaves affected skills unresolved without throwing", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async () => {
    throw new Error("connect ECONNREFUSED");
  });
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved, unresolved } = await resolveSkillsFromText(["electrician"], "transcript");

  assert.deepStrictEqual(resolved, []);
  assert.deepStrictEqual(unresolved, ["electrician"]);
});

// 13. multiple extracted skills, mixed Stage 1 + Stage 2
test("Stage 1 + Stage 2 results merge correctly for a mixed batch", async (t) => {
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const restoreFetch = mockFetchOnce(async (url, options) => {
    const body = JSON.parse(options.body);
    assert.deepStrictEqual(body.rawSkills, ["नळ दुरुस्तीचं काम"]); // only the Stage-1-unresolved one
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            rawSkill: "नळ दुरुस्तीचं काम",
            resolved: true,
            canonicalSkillId: "SKILL_MASONRY",
            canonicalSkillName: "Masonry",
            confidence: 0.8,
            reason: "semantic match",
          },
        ],
      }),
    };
  });
  t.after(() => {
    skillFindMock.mock.restore();
    restoreFetch();
  });

  const { resolved, unresolved } = await resolveSkillsFromText(
    ["plumber", "नळ दुरुस्तीचं काम"],
    "transcript"
  );

  assert.strictEqual(resolved.length, 2);
  assert.deepStrictEqual(
    resolved.map((r) => r.id).sort(),
    ["SKILL_MASONRY", "SKILL_PLUMBING"]
  );
  assert.deepStrictEqual(unresolved, []);
});

// =============================================================================
// Voice-pipeline STT variants of "electrician".
//
// The seeded catalog has 13 skills and NONE of them is electrical work
// (verified against the dev database). The correct behaviour is therefore to
// leave these UNRESOLVED so the worker sees them as free text, not to
// force-match them onto some other trade. These tests exist to make that
// guarantee explicit: a better transcript must never become a wrong skill.
// =============================================================================

const CATALOG_WITHOUT_ELECTRICIAN = [
  { _id: "SKILL_PLUMBING", name: { en: "Plumbing", hi: "प्लंबिंग", mr: "प्लंबिंग" }, isActive: true },
  { _id: "SKILL_CARPENTRY", name: { en: "Carpentry", hi: "बढ़ईगीरी", mr: "सुतारकाम" }, isActive: true },
  { _id: "SKILL_PAINTING", name: { en: "Painting", hi: "पेंटिंग", mr: "रंगकाम" }, isActive: true },
];

for (const variant of ["इलेक्ट्रिशियन", "इलेक्ट्रिशियन्स", "इलेक्ट्रिशिंच", "इलेक्ट्रिशन्स", "electrician"]) {
  test(`Voice STT variant "${variant}" stays unresolved when the catalog has no electrical skill`, () => {
    const { resolved, unresolved } = resolveDeterministic(
      [variant],
      CATALOG_WITHOUT_ELECTRICIAN,
      SKILL_ALIASES
    );

    assert.deepStrictEqual(resolved, [], "must not be force-matched onto an unrelated trade");
    assert.deepStrictEqual(unresolved, [variant], "must come back as free text for the worker to see");
  });
}

test("Voice STT variants never invent a skill id outside the catalog", () => {
  const { resolved } = resolveDeterministic(
    ["इलेक्ट्रिशियन्स", "इलेक्ट्रिशिंच", "Plumbing"],
    CATALOG_WITHOUT_ELECTRICIAN,
    SKILL_ALIASES
  );

  const catalogIds = new Set(CATALOG_WITHOUT_ELECTRICIAN.map((s) => s._id));
  for (const entry of resolved) {
    assert.ok(catalogIds.has(entry.id), `${entry.id} is not a real catalog id`);
  }
  // The one genuinely present skill still resolves.
  assert.deepStrictEqual(resolved.map((r) => r.id), ["SKILL_PLUMBING"]);
});

test("A real Marathi trade word still resolves - the guard above is not blanket rejection", () => {
  const { resolved, unresolved } = resolveDeterministic(
    ["सुतारकाम"],
    CATALOG_WITHOUT_ELECTRICIAN,
    SKILL_ALIASES
  );

  assert.deepStrictEqual(unresolved, []);
  assert.deepStrictEqual(resolved.map((r) => r.id), ["SKILL_CARPENTRY"]);
});
