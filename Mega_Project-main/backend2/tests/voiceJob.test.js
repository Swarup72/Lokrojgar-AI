/**
 * Guided voice JOB POSTING — authorization, ownership and the absence of a
 * publish path.
 *
 * These boot the real Express app and make real HTTP requests, with the models
 * mocked, so the routing, the role guard, the validators and the controller's
 * ownership logic are all exercised together. What they are protecting:
 *
 *   1. A draft is an EMPLOYER's. The controller resolves the employer from
 *      req.user and puts employerId in every query filter, so another
 *      employer's draft is not merely hidden — it does not match the query.
 *   2. A client-supplied employerId must change nothing. The body is never a
 *      source of ownership.
 *   3. There is NO route here that creates a Job. Publishing goes through the
 *      existing POST /jobs so that a voice advert is validated and translated
 *      exactly like a typed one; a second publish path would be the same
 *      mistake that retired /offers.
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import jwt from "jsonwebtoken";

process.env.AI_SERVICE_URL = "http://test-ai:9000";
process.env.ACCESS_TOKEN_SECRET = "test_access_token_secret_32_chars_long!!";

import { app } from "../src/app.js";
import User from "../src/models/user.model.js";
import Session from "../src/models/session.model.js";
import Job from "../src/models/job.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import VoiceJobDraft from "../src/models/voiceJobDraft.model.js";
import {
  VOICE_JOB_STEPS,
  VOICE_JOB_VOICE_STEPS,
  VOICE_JOB_TAP_STEPS,
} from "../src/controllers/voiceJob.controller.js";

const EMPLOYER_A_USER = "507f1f77bcf86cd799430001";
const EMPLOYER_A_PROFILE = "507f1f77bcf86cd799430011";
const EMPLOYER_B_USER = "507f1f77bcf86cd799430002";
const EMPLOYER_B_PROFILE = "507f1f77bcf86cd799430012";
const WORKER_USER = "507f1f77bcf86cd799430003";

function makeToken(payload) {
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
}

/**
 * An in-memory stand-in for the VoiceJobDraft collection that honours the
 * SAME filter the controller passes. That is the point: if the controller ever
 * stopped filtering by employerId, these fakes would start returning another
 * employer's draft and the isolation tests would fail.
 */
function makeDraftStore(seed = []) {
  const rows = seed.map((r) => ({ ...r }));
  const matches = (row, filter) =>
    Object.entries(filter).every(([k, v]) => String(row[k]) === String(v));
  return {
    rows,
    findOne: async (filter) => {
      const row = rows.find((r) => matches(r, filter));
      if (!row) return null;
      row.save = async () => row;
      row.markModified = () => {};
      return row;
    },
    create: async (doc) => {
      const row = {
        _id: `draft-${rows.length + 1}`,
        draftFields: {},
        completedSteps: [],
        status: "draft",
        ...doc,
        save: async function () {
          return this;
        },
        markModified() {},
      };
      rows.push(row);
      return row;
    },
    findOneAndDelete: async (filter) => {
      const i = rows.findIndex((r) => matches(r, filter));
      if (i === -1) return null;
      return rows.splice(i, 1)[0];
    },
  };
}

/**
 * Wires the auth chain and the draft store, then boots the app.
 * `actor` is who the bearer token belongs to.
 */
async function withServer(t, { actor = "employerA", store = makeDraftStore() } = {}) {
  const users = {
    employerA: { _id: EMPLOYER_A_USER, role: "employer", roles: ["employer"] },
    employerB: { _id: EMPLOYER_B_USER, role: "employer", roles: ["employer"] },
    worker: { _id: WORKER_USER, role: "worker", roles: ["worker"] },
  };
  const profilesByUser = {
    [EMPLOYER_A_USER]: { _id: EMPLOYER_A_PROFILE, userId: EMPLOYER_A_USER },
    [EMPLOYER_B_USER]: { _id: EMPLOYER_B_PROFILE, userId: EMPLOYER_B_USER },
  };
  const user = users[actor];

  const mocks = [
    mock.method(User, "findById", () => ({ select: async () => user })),
    mock.method(Session, "findOne", async () => null),
    mock.method(EmployerProfile, "findOne", async (filter) => {
      const userId = String(filter?.userId ?? "");
      return profilesByUser[userId] || null;
    }),
    mock.method(VoiceJobDraft, "findOne", store.findOne),
    mock.method(VoiceJobDraft, "create", store.create),
    mock.method(VoiceJobDraft, "findOneAndDelete", store.findOneAndDelete),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const port = server.address().port;
  const token = makeToken({ _id: user._id });

  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  return { call, store };
}

// --- step definitions -------------------------------------------------------

test("the wizard's tap-only steps are not in the audio step list", () => {
  // A tap answer must never cost a Whisper or Qwen call.
  for (const step of VOICE_JOB_TAP_STEPS) {
    assert.ok(!VOICE_JOB_VOICE_STEPS.includes(step), `${step} must not be a voice step`);
  }
  assert.deepEqual(VOICE_JOB_STEPS, [...VOICE_JOB_VOICE_STEPS, ...VOICE_JOB_TAP_STEPS]);
});

test("every voice step maps to a field the AI service accepts", () => {
  // Mirrors ai-service DETERMINISTIC_FIELDS + LLM_FIELDS. A step the extractor
  // does not know would 400 at the AI service, mid-wizard.
  const aiSupported = new Set([
    "jobTitle",
    "jobDescription",
    "jobSkills",
    "jobWorkerCount",
    "jobCity",
    "jobPayAmount",
    "jobPayType",
  ]);
  for (const step of VOICE_JOB_VOICE_STEPS) {
    assert.ok(aiSupported.has(step), `${step} has no extractor on the AI service`);
  }
});

// --- authorization ----------------------------------------------------------

test("a worker cannot open the job-posting wizard", async (t) => {
  const { call } = await withServer(t, { actor: "worker" });
  const res = await call("POST", "/voice-job/guided/start", { language: "mr" });
  assert.strictEqual(res.status, 403, JSON.stringify(res.json));
});

test("an unauthenticated request is rejected", async (t) => {
  await withServer(t);
  // withServer booted a server; call it without a token.
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/v1/voice-job/guided/start`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
  assert.strictEqual(res.status, 401);
});

// --- ownership --------------------------------------------------------------

test("an employer starts and reads back their own draft", async (t) => {
  const { call } = await withServer(t);

  const started = await call("POST", "/voice-job/guided/start", { language: "mr" });
  assert.strictEqual(started.status, 200, JSON.stringify(started.json));
  assert.strictEqual(started.json.data.language, "mr");
  assert.strictEqual(started.json.data.status, "draft");

  const got = await call("GET", "/voice-job/guided/draft?language=mr");
  assert.strictEqual(got.status, 200);
  assert.strictEqual(String(got.json.data.voiceJobDraftId), String(started.json.data.voiceJobDraftId));
});

test("employer B cannot read employer A's draft", async (t) => {
  // One store holding A's draft; B asks for a draft in the same language.
  const store = makeDraftStore([
    {
      _id: "draft-A",
      employerId: EMPLOYER_A_PROFILE,
      language: "mr",
      status: "draft",
      draftFields: { jobTitle: "इलेक्ट्रिशियन", jobPayAmount: 800 },
      completedSteps: ["jobTitle", "jobPayAmount"],
    },
  ]);
  const { call } = await withServer(t, { actor: "employerB", store });

  const got = await call("GET", "/voice-job/guided/draft?language=mr");
  assert.strictEqual(got.status, 200);
  // Not an error — simply no draft of their own. A's content must not leak.
  assert.strictEqual(got.json.data, null);
  assert.ok(!JSON.stringify(got.json).includes("इलेक्ट्रिशियन"));
});

test("employer B cannot overwrite employer A's draft", async (t) => {
  const store = makeDraftStore([
    {
      _id: "draft-A",
      employerId: EMPLOYER_A_PROFILE,
      language: "mr",
      status: "draft",
      draftFields: { jobTitle: "इलेक्ट्रिशियन" },
      completedSteps: ["jobTitle"],
    },
  ]);
  const { call } = await withServer(t, { actor: "employerB", store });

  const patched = await call("PATCH", "/voice-job/guided/step", {
    language: "mr",
    field: "jobTitle",
    value: "HIJACKED",
  });
  assert.strictEqual(patched.status, 200);

  const a = store.rows.find((r) => r._id === "draft-A");
  assert.strictEqual(a.draftFields.jobTitle, "इलेक्ट्रिशियन", "A's draft was modified by B");
  // B got a draft of their own instead.
  assert.strictEqual(store.rows.length, 2);
  assert.strictEqual(String(store.rows[1].employerId), EMPLOYER_B_PROFILE);
});

test("employer B cannot discard employer A's draft", async (t) => {
  const store = makeDraftStore([
    { _id: "draft-A", employerId: EMPLOYER_A_PROFILE, language: "mr", status: "draft" },
  ]);
  const { call } = await withServer(t, { actor: "employerB", store });

  const res = await call("DELETE", "/voice-job/guided/draft", { language: "mr" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.data.discarded, false);
  assert.ok(store.rows.some((r) => r._id === "draft-A"), "A's draft was deleted by B");
});

test("a client-supplied employerId in the body changes nothing", async (t) => {
  const store = makeDraftStore();
  const { call } = await withServer(t, { actor: "employerB", store });

  await call("POST", "/voice-job/guided/start", {
    language: "mr",
    employerId: EMPLOYER_A_PROFILE, // impersonation attempt
  });

  assert.strictEqual(store.rows.length, 1);
  assert.strictEqual(
    String(store.rows[0].employerId),
    EMPLOYER_B_PROFILE,
    "ownership was taken from the request body"
  );
});

// --- draft semantics --------------------------------------------------------

test("a retry of one step leaves the other answers intact", async (t) => {
  const store = makeDraftStore([
    {
      _id: "draft-A",
      employerId: EMPLOYER_A_PROFILE,
      language: "mr",
      status: "draft",
      draftFields: { jobTitle: "इलेक्ट्रिशियन", jobPayAmount: 800, jobCity: "कोल्हापूर" },
      completedSteps: ["jobTitle", "jobPayAmount", "jobCity"],
    },
  ]);
  const { call } = await withServer(t, { store });

  const res = await call("PATCH", "/voice-job/guided/step", {
    language: "mr",
    field: "jobPayAmount",
    value: 950,
  });
  assert.strictEqual(res.status, 200);

  const fields = res.json.data.draftFields;
  assert.strictEqual(fields.jobPayAmount, 950);
  assert.strictEqual(fields.jobTitle, "इलेक्ट्रिशियन", "an unrelated answer was lost on retry");
  assert.strictEqual(fields.jobCity, "कोल्हापूर", "an unrelated answer was lost on retry");
});

test("clearing a field also clears its completed mark", async (t) => {
  const store = makeDraftStore([
    {
      _id: "draft-A",
      employerId: EMPLOYER_A_PROFILE,
      language: "mr",
      status: "draft",
      draftFields: { jobCity: "कोल्हापूर" },
      completedSteps: ["jobCity"],
    },
  ]);
  const { call } = await withServer(t, { store });

  const res = await call("PATCH", "/voice-job/guided/step", {
    language: "mr",
    field: "jobCity",
    value: null,
  });
  assert.strictEqual(res.status, 200);
  assert.ok(!res.json.data.completedSteps.includes("jobCity"));
});

test("an unknown step is rejected", async (t) => {
  const { call } = await withServer(t);
  const res = await call("PATCH", "/voice-job/guided/step", {
    language: "mr",
    field: "jobSalaryBonus",
    value: 1,
  });
  assert.strictEqual(res.status, 400);
});

test("an invalid shift type is rejected", async (t) => {
  const { call } = await withServer(t);
  const res = await call("PATCH", "/voice-job/guided/step", {
    language: "mr",
    field: "jobShiftType",
    value: "graveyard",
  });
  assert.strictEqual(res.status, 400);
});

test("an unsupported spoken language is rejected", async (t) => {
  const { call } = await withServer(t);
  const res = await call("POST", "/voice-job/guided/start", { language: "ta" });
  assert.strictEqual(res.status, 400);
});

// --- no publish path --------------------------------------------------------

test("the voice-job router exposes no route that creates a job", async (t) => {
  const created = [];
  const jobCreate = mock.method(Job, "create", async (doc) => {
    created.push(doc);
    return { _id: "job-1", ...doc };
  });
  t.after(() => jobCreate.mock.restore());

  const { call } = await withServer(t);

  // Every plausible publish verb against this router.
  for (const [method, path] of [
    ["POST", "/voice-job/guided/publish"],
    ["POST", "/voice-job/publish"],
    ["POST", "/voice-job/guided/submit"],
    ["POST", "/voice-job"],
  ]) {
    const res = await call(method, path, { language: "mr" });
    assert.ok(
      res.status === 404 || res.status === 405,
      `${method} ${path} should not exist, got ${res.status}`
    );
  }
  assert.strictEqual(created.length, 0, "a job was created by the voice-job router");
});

test("completing every step still creates no job", async (t) => {
  const created = [];
  const jobCreate = mock.method(Job, "create", async (doc) => {
    created.push(doc);
    return { _id: "job-1", ...doc };
  });
  t.after(() => jobCreate.mock.restore());

  const store = makeDraftStore();
  const { call } = await withServer(t, { store });

  await call("POST", "/voice-job/guided/start", { language: "mr" });
  for (const field of VOICE_JOB_TAP_STEPS) {
    await call("PATCH", "/voice-job/guided/step", {
      language: "mr",
      field,
      value: field === "jobShiftType" ? "day" : "2026-12-01",
    });
  }
  const consumed = await call("POST", "/voice-job/guided/consume", { language: "mr" });
  assert.strictEqual(consumed.status, 200);
  assert.strictEqual(consumed.json.data.status, "consumed");

  // Consuming hands the values to the Add Job form. It must not publish.
  assert.strictEqual(created.length, 0, "consuming a draft published a job");
});
