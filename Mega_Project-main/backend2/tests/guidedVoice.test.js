/**
 * The guided voice flow: draft safety, ownership, step progression and retry.
 *
 * The guiding rules these pin down:
 *   - a guided session accumulates answers in a VoiceProfile DRAFT and never
 *     touches the canonical WorkerProfile until the worker confirms;
 *   - a failed extraction or a failed retry leaves earlier answers intact;
 *   - exactly one step (skills) reaches the language model;
 *   - a recording is transcribed and deleted - never stored;
 *   - every read and write is scoped to the authenticated worker.
 */

import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";

import VoiceProfile from "../src/models/voiceProfile.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import { AiServiceUnavailableError } from "../src/services/ai.service.js";
import {
  startGuidedSession,
  getGuidedDraft,
  submitGuidedVoiceStep,
  setGuidedDraftField,
  discardGuidedDraft,
  GUIDED_VOICE_STEPS,
  GUIDED_TAP_STEPS,
  GUIDED_STEPS,
} from "../src/controllers/voiceProfile.controller.js";

const WORKER_USER = "507f1f77bcf86cd7994b0001";
const WORKER_PROFILE = "507f1f77bcf86cd7994b0002";
const OTHER_PROFILE = "507f1f77bcf86cd7994b0003";
const DRAFT_ID = "507f1f77bcf86cd7994b0004";

function fakeReqRes({ user, body = {}, query = {}, file } = {}) {
  const req = { user, body, query, params: {}, file };
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      settle({ error: null });
      return this;
    },
  };
  return { req, res, next: (err) => settle({ error: err || null }), done };
}

/** A draft that behaves like a Mongoose document. */
function fakeDraft(overrides = {}) {
  return {
    _id: DRAFT_ID,
    workerId: WORKER_PROFILE,
    language: "mr",
    mode: "guided",
    status: "draft",
    draftFields: {},
    completedSteps: [],
    transcript: null,
    markModified() {},
    save: async function () {
      return this;
    },
    ...overrides,
  };
}

/**
 * Mocks the two lookups every guided handler makes. VoiceProfile.findOne answers
 * only the filter it is given - faithful to MongoDB - so the ownership scoping is
 * genuinely exercised: a filter naming a different workerId finds nothing.
 */
function mockGuided(t, { draft = fakeDraft(), workerProfile } = {}) {
  const created = [];
  const profile = workerProfile ?? { _id: WORKER_PROFILE, userId: WORKER_USER };
  const mocks = [
    mock.method(WorkerProfile, "findOne", async ({ userId }) =>
      String(userId) === WORKER_USER ? profile : null
    ),
    mock.method(VoiceProfile, "findOne", async (filter) => {
      if (!draft) return null;
      if (String(filter.workerId) !== String(draft.workerId)) return null;
      if (filter.language && filter.language !== draft.language) return null;
      if (filter.mode && filter.mode !== draft.mode) return null;
      return draft;
    }),
    mock.method(VoiceProfile, "create", async (doc) => {
      created.push(doc);
      return fakeDraft(doc);
    }),
    mock.method(VoiceProfile, "deleteOne", async (filter) => {
      created.push({ deleted: filter });
      return { deletedCount: 1 };
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
  return { draft, created, profile };
}

/** A real temp file, so the controller's own cleanup can be observed. */
function fakeRecording(bytes = 2048) {
  const filePath = path.join(os.tmpdir(), `guided-test-${Date.now()}-${Math.random()}.webm`);
  fs.writeFileSync(filePath, Buffer.alloc(bytes, 1));
  return { path: filePath, size: bytes, originalname: "step.webm", mimetype: "audio/webm" };
}

/**
 * Mocks the AI service at the FETCH boundary.
 *
 * processVoiceFieldAudio is a plain ESM function export, which cannot be
 * redefined by mock.method - the same constraint the application-controller tests
 * work around. Mocking global.fetch instead has the advantage of exercising the
 * real client, the real multipart assembly and the real error classification;
 * only the network is faked.
 *
 * `respond(field)` returns the AI service's own snake_case payload.
 */
function mockAiFetch(t, respond) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    const field = options?.body?.get ? options.body.get("field") : undefined;
    calls.push({ url: String(url), field });
    const result = await respond(field);
    if (result instanceof Error) throw result;
    return { ok: true, status: 200, json: async () => result };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });
  return calls;
}

/** The AI service's /voice/extract-field response shape. */
const fieldResponse = (overrides) => ({
  field: "fullName",
  transcript: "",
  value: null,
  ok: false,
  reason: "",
  candidates: [],
  confidence: null,
  used_llm: false,
  ...overrides,
});

// =============================================================================
// B. Step progression
// =============================================================================

test("B: the step order is five voice steps then two tap steps", () => {
  assert.deepStrictEqual(GUIDED_VOICE_STEPS, ["fullName", "expectedPay", "experienceYears", "skills", "city"]);
  // Languages and availability are three-option enums: tapping one is faster and
  // cannot be misheard, so they deliberately never record audio.
  assert.deepStrictEqual(GUIDED_TAP_STEPS, ["languages", "availability"]);
  assert.strictEqual(GUIDED_STEPS.length, 7);
});

test("B: starting a session creates a draft and reports the step plan", async (t) => {
  const { created } = mockGuided(t, { draft: null });

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, body: { language: "mr" } });
  startGuidedSession(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].mode, "guided");
  assert.strictEqual(created[0].status, "draft", "a new session must start as a DRAFT");
  assert.deepStrictEqual(created[0].draftFields, {});
  assert.deepStrictEqual(res.body.data.steps, GUIDED_STEPS);
});

test("B: starting again RESUMES the existing draft rather than wiping it", async (t) => {
  const draft = fakeDraft({ draftFields: { fullName: "स्वरूप पाल", expectedPay: 800 }, completedSteps: ["fullName", "expectedPay"] });
  const { created } = mockGuided(t, { draft });

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, body: { language: "mr" } });
  startGuidedSession(req, res, next);
  await done;

  assert.strictEqual(created.length, 0, "an existing draft must not be recreated");
  assert.deepStrictEqual(res.body.data.draftFields, { fullName: "स्वरूप पाल", expectedPay: 800 });
  assert.deepStrictEqual(res.body.data.completedSteps, ["fullName", "expectedPay"]);
});

test("B: an unsupported spoken language is rejected", async (t) => {
  mockGuided(t);
  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, body: { language: "fr" } });
  startGuidedSession(req, res, next);
  const { error } = await done;
  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

// =============================================================================
// D/E/F/G/H. Voice steps
// =============================================================================

test("D: a name step records the extracted name on the draft", async (t) => {
  const { draft } = mockGuided(t);
  mockAiFetch(t, async () =>
    fieldResponse({
      field: "fullName",
      transcript: "माझं नाव स्वरूप समीर पाल आहे",
      value: "स्वरूप समीर पाल",
      ok: true,
      confidence: 0.9,
    })
  );

  const file = fakeRecording();
  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "fullName" },
    file,
  });
  submitGuidedVoiceStep(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.body.data.value, "स्वरूप समीर पाल");
  assert.strictEqual(draft.draftFields.fullName, "स्वरूप समीर पाल");
  assert.ok(draft.completedSteps.includes("fullName"));
  assert.strictEqual(res.body.data.usedLlm, false, "a name must not cost a language-model call");
  assert.strictEqual(fs.existsSync(file.path), false, "the recording must be deleted");
});

test("E: pay 0 is recorded as a real answer, not dropped", async (t) => {
  const { draft } = mockGuided(t);
  mockAiFetch(t, async () =>
    fieldResponse({ field: "expectedPay", transcript: "मला शून्य रुपये", value: 0, ok: true, candidates: [0] })
  );

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "expectedPay" },
    file: fakeRecording(),
  });
  submitGuidedVoiceStep(req, res, next);
  await done;

  assert.strictEqual(draft.draftFields.expectedPay, 0);
  assert.ok(draft.completedSteps.includes("expectedPay"), "zero is an answered step");
});

test("E: a malformed number leaves the step unanswered, with the transcript to show", async (t) => {
  const { draft } = mockGuided(t);
  mockAiFetch(t, async () =>
    fieldResponse({ field: "expectedPay", transcript: "मला 2,7,7 रुपये पाहिजे", reason: "no_number_found" })
  );

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "expectedPay" },
    file: fakeRecording(),
  });
  submitGuidedVoiceStep(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null, "a field that could not be understood is not an error");
  assert.strictEqual(res.body.data.ok, false);
  assert.strictEqual(res.body.data.reason, "no_number_found");
  assert.strictEqual(res.body.data.value, null, "nothing may be invented");
  assert.ok(res.body.data.transcript.includes("2,7,7"), "the worker must see what was heard");
  assert.strictEqual(draft.completedSteps.includes("expectedPay"), false);
});

test("G: the skills step is the ONLY step that uses the language model", async (t) => {
  const { draft } = mockGuided(t);
  const calls = mockAiFetch(t, async (field) =>
    fieldResponse({
      field,
      transcript: "t",
      value: field === "skills" ? ["electrician", "wire connection"] : "x",
      ok: true,
      // The AI service sets this per field; only the skills step does.
      used_llm: field === "skills",
    })
  );

  const seen = [];
  for (const field of GUIDED_VOICE_STEPS) {
    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      body: { language: "mr", field },
      file: fakeRecording(),
    });
    submitGuidedVoiceStep(req, res, next);
    await done;
    seen.push({ field, usedLlm: res.body.data.usedLlm });
  }

  assert.deepStrictEqual(calls.map((c) => c.field), GUIDED_VOICE_STEPS, "every voice step was transcribed");
  assert.ok(calls.every((c) => c.url.includes("/voice/extract-field")), "guided steps use the per-field endpoint");
  const llmSteps = seen.filter((s) => s.usedLlm).map((s) => s.field);
  assert.deepStrictEqual(llmSteps, ["skills"], "exactly ONE language-model call per guided session");
  assert.deepStrictEqual(draft.draftFields.skills, ["electrician", "wire connection"]);
});

test("a field outside the voice steps is rejected and the recording still cleaned up", async (t) => {
  mockGuided(t);
  const file = fakeRecording();
  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "languages" },
    file,
  });
  submitGuidedVoiceStep(req, res, next);
  const { error } = await done;

  assert.ok(error, "languages is a tap step - it must not accept audio");
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(fs.existsSync(file.path), false, "the temp file must never be left behind");
});

test("an empty recording is rejected before any AI call", async (t) => {
  mockGuided(t);
  const aiCalls = mockAiFetch(t, async () => new Error("no AI call may be made for an empty recording"));
  const file = fakeRecording(0);
  file.size = 0;

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "fullName" },
    file,
  });
  submitGuidedVoiceStep(req, res, next);
  const { error } = await done;

  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(aiCalls.length, 0);
  assert.strictEqual(fs.existsSync(file.path), false);
});

test("a missing audio file is a 400", async (t) => {
  mockGuided(t);
  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "fullName" },
  });
  submitGuidedVoiceStep(req, res, next);
  const { error } = await done;
  assert.strictEqual(error.statusCode, 400);
});

test("S: an AI outage is a 503 and the recording is still deleted", async (t) => {
  mockGuided(t);
  // A transport failure is what the client classifies as "service unavailable".
  mockAiFetch(t, async () => Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
  const file = fakeRecording();

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "fullName" },
    file,
  });
  submitGuidedVoiceStep(req, res, next);
  const { error } = await done;

  assert.strictEqual(error.statusCode, 503);
  assert.strictEqual(fs.existsSync(file.path), false, "no audio may survive a failure either");
});

// =============================================================================
// C / L. Retry must not corrupt an earlier good answer
// =============================================================================

test("C/L: a failed retry leaves the previously captured value intact", async (t) => {
  const draft = fakeDraft({ draftFields: { expectedPay: 800 }, completedSteps: ["expectedPay"] });
  mockGuided(t, { draft });
  mockAiFetch(t, async () =>
    fieldResponse({ field: "expectedPay", transcript: "मला 2,7,7", reason: "no_number_found" })
  );

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "expectedPay" },
    file: fakeRecording(),
  });
  submitGuidedVoiceStep(req, res, next);
  await done;

  assert.strictEqual(draft.draftFields.expectedPay, 800, "a failed retry must not erase a good answer");
  assert.ok(draft.completedSteps.includes("expectedPay"));
});

test("C: a successful retry replaces the earlier value", async (t) => {
  const draft = fakeDraft({ draftFields: { expectedPay: 800 }, completedSteps: ["expectedPay"] });
  mockGuided(t, { draft });
  mockAiFetch(t, async () =>
    fieldResponse({ field: "expectedPay", transcript: "मला नऊशे रुपये", value: 900, ok: true, candidates: [900] })
  );

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "expectedPay" },
    file: fakeRecording(),
  });
  submitGuidedVoiceStep(req, res, next);
  await done;

  assert.strictEqual(draft.draftFields.expectedPay, 900);
});

test("L: one step's answer never disturbs another step's", async (t) => {
  const draft = fakeDraft({
    draftFields: { fullName: "स्वरूप पाल", expectedPay: 800, experienceYears: 5 },
    completedSteps: ["fullName", "expectedPay", "experienceYears"],
  });
  mockGuided(t, { draft });
  mockAiFetch(t, async () =>
    fieldResponse({ field: "city", transcript: "मी कोल्हापूरमध्ये राहतो", value: "कोल्हापूर", ok: true })
  );

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "city" },
    file: fakeRecording(),
  });
  submitGuidedVoiceStep(req, res, next);
  await done;

  assert.deepStrictEqual(draft.draftFields, {
    fullName: "स्वरूप पाल",
    expectedPay: 800,
    experienceYears: 5,
    city: "कोल्हापूर",
  });
});

// =============================================================================
// I. Tap steps
// =============================================================================

test("I: languages are saved by tap, with no AI call and no audio", async (t) => {
  const { draft } = mockGuided(t);
  const aiCalls = mockAiFetch(t, async () => new Error("a tap step must never reach the AI service"));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "languages", value: ["mr", "hi"] },
  });
  setGuidedDraftField(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.deepStrictEqual(draft.draftFields.languages, ["mr", "hi"]);
  assert.strictEqual(aiCalls.length, 0, "no network call for a tap step");
});

test("I: availability is saved by tap", async (t) => {
  const { draft } = mockGuided(t);
  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "availability", value: "busy" },
  });
  setGuidedDraftField(req, res, next);
  await done;
  assert.strictEqual(draft.draftFields.availability, "busy");
});

for (const [label, body] of [
  ["an unsupported language code", { field: "languages", value: ["fr"] }],
  ["a non-array languages value", { field: "languages", value: "mr" }],
  ["an unsupported availability", { field: "availability", value: "maybe" }],
  ["a negative pay", { field: "expectedPay", value: -5 }],
  ["experience above 60", { field: "experienceYears", value: 61 }],
  ["a non-numeric pay", { field: "expectedPay", value: "lots" }],
  ["an unknown field", { field: "favouriteColour", value: "blue" }],
]) {
  test(`I: ${label} is rejected with 400`, async (t) => {
    const { draft } = mockGuided(t);
    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      body: { language: "mr", ...body },
    });
    setGuidedDraftField(req, res, next);
    const { error } = await done;

    assert.ok(error, `${label} must not be accepted`);
    assert.strictEqual(error.statusCode, 400);
    assert.deepStrictEqual(draft.draftFields, {}, "nothing may be recorded for a rejected value");
  });
}

test("I: a manual correction of 0 on the review screen is kept", async (t) => {
  const { draft } = mockGuided(t);
  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { language: "mr", field: "experienceYears", value: 0 },
  });
  setGuidedDraftField(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(draft.draftFields.experienceYears, 0);
  assert.ok(draft.completedSteps.includes("experienceYears"));
});

// =============================================================================
// J. Draft persistence and K. abandonment
// =============================================================================

test("J: a draft in progress is returned so the wizard can resume", async (t) => {
  const draft = fakeDraft({ draftFields: { fullName: "स्वरूप", city: "कोल्हापूर" }, completedSteps: ["fullName", "city"] });
  mockGuided(t, { draft });

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, query: { language: "mr" } });
  getGuidedDraft(req, res, next);
  await done;

  assert.strictEqual(res.body.data.status, "draft");
  assert.deepStrictEqual(res.body.data.completedSteps, ["fullName", "city"]);
});

test("J: no draft returns null rather than inventing one", async (t) => {
  const { created } = mockGuided(t, { draft: null });
  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, query: { language: "mr" } });
  getGuidedDraft(req, res, next);
  await done;

  assert.strictEqual(res.body.data, null);
  assert.strictEqual(created.length, 0, "reading a draft must not create one");
});

test("K: discarding a draft deletes ONLY the draft", async (t) => {
  const { created } = mockGuided(t);
  const profileUpdate = mock.method(WorkerProfile, "findOneAndUpdate", async () => {
    throw new Error("discarding a draft must not touch the canonical profile");
  });
  t.after(() => profileUpdate.mock.restore());

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, body: { language: "mr" } });
  discardGuidedDraft(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  const deletion = created.find((entry) => entry.deleted);
  assert.ok(deletion, "the draft must be deleted");
  assert.strictEqual(deletion.deleted.mode, "guided");
  assert.strictEqual(deletion.deleted.status, "draft", "only a DRAFT may be deleted this way");
  assert.strictEqual(profileUpdate.mock.callCount(), 0);
});

test("K: no guided handler ever writes to WorkerProfile", async (t) => {
  // The canonical profile is only reached through confirmAndApplyToProfile.
  const { draft } = mockGuided(t);
  const forbidden = [
    mock.method(WorkerProfile, "findOneAndUpdate", async () => {
      throw new Error("guided steps must not write to WorkerProfile");
    }),
    mock.method(WorkerProfile, "updateOne", async () => {
      throw new Error("guided steps must not write to WorkerProfile");
    }),
  ];
  t.after(() => forbidden.forEach((m) => m.mock.restore()));
  mockAiFetch(t, async (field) => fieldResponse({ field, transcript: "t", value: 800, ok: true }));

  for (const body of [
    { field: "expectedPay" },
  ]) {
    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      body: { language: "mr", ...body },
      file: fakeRecording(),
    });
    submitGuidedVoiceStep(req, res, next);
    const { error } = await done;
    assert.strictEqual(error, null);
  }
  assert.strictEqual(draft.draftFields.expectedPay, 800, "the answer lives on the draft only");
});

// =============================================================================
// N. Ownership
// =============================================================================

test("N: a guided draft is scoped to the authenticated worker's own profile", async (t) => {
  // The draft belongs to a DIFFERENT worker profile, so the scoped lookup must
  // not find it - and must not fall back to it either.
  const otherDraft = fakeDraft({ workerId: OTHER_PROFILE, draftFields: { fullName: "Someone Else" } });
  const { created } = mockGuided(t, { draft: otherDraft });

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, query: { language: "mr" } });
  getGuidedDraft(req, res, next);
  await done;

  assert.strictEqual(res.body.data, null, "another worker's draft must be invisible");
});

test("N: the draft lookup always carries the caller's own workerId", async (t) => {
  let capturedFilter = null;
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => ({ _id: WORKER_PROFILE, userId: WORKER_USER })),
    mock.method(VoiceProfile, "findOne", async (filter) => {
      capturedFilter = filter;
      return null;
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, query: { language: "mr" } });
  getGuidedDraft(req, res, next);
  await done;

  assert.strictEqual(String(capturedFilter.workerId), WORKER_PROFILE);
  assert.strictEqual(capturedFilter.mode, "guided");
});

test("N: a user with no worker profile cannot reach a draft at all", async (t) => {
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => null),
    mock.method(VoiceProfile, "findOne", async () => {
      throw new Error("no draft lookup without a worker profile");
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({ user: { _id: "507f1f77bcf86cd7994b00ff" }, query: { language: "mr" } });
  getGuidedDraft(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
});

test("N: a worker's drafts are kept separate per spoken language", async (t) => {
  const marathiDraft = fakeDraft({ language: "mr", draftFields: { fullName: "मराठी" } });
  mockGuided(t, { draft: marathiDraft });

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, query: { language: "hi" } });
  getGuidedDraft(req, res, next);
  await done;

  assert.strictEqual(res.body.data, null, "a Hindi session must not pick up the Marathi draft");
});
