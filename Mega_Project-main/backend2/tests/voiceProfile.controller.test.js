import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import fs from "fs";

process.env.AI_SERVICE_URL = "http://test-ai:9000";
process.env.B2_APPLICATION_KEY_ID = "test-key-id";
process.env.B2_APPLICATION_KEY = "test-app-key";
process.env.B2_BUCKET_NAME = "test-bucket";
process.env.B2_REGION = "us-test-000";
process.env.B2_ENDPOINT = "https://s3.us-test-000.backblazeb2.com";

import WorkerProfile from "../src/models/workerProfile.model.js";
import VoiceProfile from "../src/models/voiceProfile.model.js";
import Skill from "../src/models/skill.model.js";
import JobCategory from "../src/models/jobCategory.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import { uploadAudioAndExtract, confirmAndApplyToProfile } from "../src/controllers/voiceProfile.controller.js";
import { getB2Client } from "../src/utils/b2.js";

// uploadVoiceProfileAudioService (storage.service.js) is a plain named
// function export - ESM namespace exports are non-configurable, so it
// cannot be mocked directly (confirmed: attempting to do so throws "Cannot
// redefine property"). Mocking the shared S3Client's .send() instead - a
// genuinely mutable property on the client instance returned by
// getB2Client() - lets the REAL uploadVoiceProfileAudioService ->
// uploadAudioToB2 code run for real, including its real key-generation and
// content-type logic, and only replaces the actual network call.
//
// ai.service.js's own HTTP call to the AI service is likewise mocked via
// global.fetch (forwardAudioForExtraction is a plain ESM export, same
// non-configurability issue) rather than via the now-removed Sarvam client.

function mockFetchOnce(handler) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = originalFetch;
  };
}

function fakeReqRes({ user, body = {}, file } = {}) {
  const req = { user, body, file };
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
  const next = (err) => settle({ error: err || new Error("next() called with no error") });
  return { req, res, next, done };
}

const VALID_EXTRACTION = {
  fullName: "Rahul",
  experienceYears: 5,
  expectedPay: null,
  skills: ["plumbing"],
  city: null,
  bio: "Plumber with five years of experience.",
  availability: "available",
  languages: ["mr", "hi"],
  preferredJobCategories: ["construction"],
};

test("uploadAudioAndExtract: transcribes the local file, cleans it up, and never uploads it anywhere", async (t) => {
  const tempFilePath = new URL("./fixtures/upload-order-test.audio", import.meta.url).pathname;
  fs.mkdirSync(new URL("./fixtures/", import.meta.url).pathname, { recursive: true });
  fs.writeFileSync(tempFilePath, Buffer.from([0]));

  const worker = { _id: "WORKER001" };
  const callOrder = [];

  const restoreFetch = mockFetchOnce(async () => {
    // The critical assertion: at the moment the AI service is called (which
    // only happens after ai.service.js has already read the file into
    // memory via fs.readFileSync), the local file must still exist on disk.
    // Before the original fix, uploadAudioService (called first) deleted it
    // before it was ever read.
    assert.ok(fs.existsSync(tempFilePath), "local audio file must still exist when it is read");
    callOrder.push("transcribe+extract");
    return {
      ok: true,
      json: async () => ({
        transcript: "test transcript",
        extracted_profile: VALID_EXTRACTION,
        confidence: 0.9,
      }),
    };
  });
  // H-7: the recording is a processing artifact now - it is transcribed and
  // deleted, never uploaded. Any call through the B2 client at all is a
  // regression, so this mock fails the test rather than recording an order.
  const b2Client = getB2Client();
  const uploadMock = mock.method(b2Client, "send", async (command) => {
    callOrder.push(`b2:${command.constructor.name}`);
    return { ETag: '"should-never-happen"' };
  });
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => worker);
  const voiceProfileUpsertMock = mock.method(VoiceProfile, "findOneAndUpdate", async (_filter, update) => ({
    _id: "VP001",
    ...update,
  }));

  t.after(() => {
    restoreFetch();
    uploadMock.mock.restore();
    workerFindOneMock.mock.restore();
    voiceProfileUpsertMock.mock.restore();
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { language: "mr" },
    file: { path: tempFilePath },
  });

  uploadAudioAndExtract(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(callOrder, ["transcribe+extract"], "no B2 call may happen");
  assert.strictEqual(uploadMock.mock.callCount(), 0, "the voice flow must never contact B2");
  assert.strictEqual(fs.existsSync(tempFilePath), false, "temp file must be cleaned up after success");
  assert.strictEqual(res.body.data.confidence, 0.9);
  // The extracted payload the review screen consumes is unchanged...
  assert.strictEqual(res.body.data.transcript, "test transcript");
  assert.deepStrictEqual(res.body.data.extractedFields, VALID_EXTRACTION);
  // ...and no storage key is written any more.
  assert.strictEqual(res.body.data.audioKey, undefined, "audioKey must no longer be set");
});

test("uploadAudioAndExtract: temp file is still cleaned up when processing fails", async (t) => {
  const tempFilePath = new URL("./fixtures/upload-cleanup-failure-test.audio", import.meta.url).pathname;
  fs.writeFileSync(tempFilePath, Buffer.from([0]));

  const worker = { _id: "WORKER001" };
  const restoreFetch = mockFetchOnce(async () => ({
    ok: false,
    status: 422,
    json: async () => ({ detail: "upstream failure" }),
  }));
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => worker);

  t.after(() => {
    restoreFetch();
    workerFindOneMock.mock.restore();
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { language: "mr" },
    file: { path: tempFilePath },
  });

  uploadAudioAndExtract(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 500);
  assert.strictEqual(fs.existsSync(tempFilePath), false, "temp file must be cleaned up even on failure");
});

test("uploadAudioAndExtract: AI service unavailable returns a clean 503, not a crash or fake profile", async (t) => {
  const tempFilePath = new URL("./fixtures/upload-nokey-test.audio", import.meta.url).pathname;
  fs.writeFileSync(tempFilePath, Buffer.from([0]));

  const worker = { _id: "WORKER001" };
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => worker);

  const restoreFetch = mockFetchOnce(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ detail: "Sarvam AI is not configured (SARVAM_API_KEY missing)." }),
  }));

  t.after(() => {
    workerFindOneMock.mock.restore();
    restoreFetch();
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { language: "mr" },
    file: { path: tempFilePath },
  });

  uploadAudioAndExtract(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 503);
  assert.strictEqual(fs.existsSync(tempFilePath), false, "temp file must still be cleaned up");
});

test("uploadAudioAndExtract: missing file returns 400 without touching the AI service", async () => {
  const { req, res, next, done } = fakeReqRes({ user: { _id: "USER001" }, body: {}, file: undefined });

  uploadAudioAndExtract(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

// Small fake catalog shared by the tests below - _id values are plain
// strings (strings already have a working .toString()), matching how
// skillNormalization.js only ever calls doc._id.toString().
const FAKE_SKILLS = [
  { _id: "SKILL_PLUMBING", name: { en: "Plumbing", hi: "प्लंबिंग", mr: "प्लंबिंग" }, isActive: true },
  { _id: "SKILL_MASONRY", name: { en: "Masonry", hi: "राजमिस्त्री", mr: "गवंडीकाम" }, isActive: true },
];
const FAKE_CATEGORIES = [
  { _id: "CAT_CONSTRUCTION", name: { en: "Construction Work", hi: "निर्माण कार्य", mr: "बांधकाम कार्य" }, isActive: true },
];

const WORKER_PROFILE_ID = "WORKERPROFILE001";

/**
 * Mocks VoiceProfile.findOne so it answers only the filter it is given - the
 * way MongoDB would. Ownership is part of that filter now, so a lookup for a
 * VoiceProfile belonging to a different worker genuinely finds nothing, and
 * these tests exercise the check instead of stepping around it.
 */
function mockOwnedVoiceProfile(voiceProfile, ownerWorkerId = WORKER_PROFILE_ID) {
  return mock.method(VoiceProfile, "findOne", async (filter) => {
    if (String(filter._id) !== String(voiceProfile._id)) return null;
    if (String(filter.workerId) !== String(ownerWorkerId)) return null;
    return voiceProfile;
  });
}

function fakeWorkerProfile(overrides = {}) {
  return {
    // The VoiceProfile is now looked up by { _id, workerId }, so the profile
    // needs an id for ownership to be checked against.
    _id: WORKER_PROFILE_ID,
    userId: "USER001",
    fullName: "Old Name",
    bio: {},
    availability: "unavailable",
    languages: ["en"],
    preferredJobCategories: [],
    save: async function () {
      return this;
    },
    ...overrides,
  };
}

test("confirmAndApplyToProfile: applies availability, languages, and bio", async (t) => {
  const workerProfile = fakeWorkerProfile();
  const voiceProfile = { _id: "VP001", language: "mr", status: "committed", save: async function () { return this; } };

  const voiceProfileFindOneMock = mockOwnedVoiceProfile(voiceProfile);
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => workerProfile);
  const skillFindMock = mock.method(Skill, "find", async () => []);
  const categoryFindMock = mock.method(JobCategory, "find", async () => []);

  t.after(() => {
    voiceProfileFindOneMock.mock.restore();
    workerFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    categoryFindMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: {
      voiceProfileId: "VP001",
      confirmedFields: {
        fullName: "Rahul Sharma",
        availability: "available",
        languages: ["mr", "hi"],
        bio: "Experienced plumber.",
      },
    },
  });

  confirmAndApplyToProfile(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(workerProfile.fullName, "Rahul Sharma");
  assert.strictEqual(workerProfile.availability, "available");
  assert.deepStrictEqual(workerProfile.languages, ["mr", "hi"]);
  assert.strictEqual(workerProfile.bio.mr, "Experienced plumber.");
});

test("confirmAndApplyToProfile: a known skill alias resolves and creates a WorkerSkill", async (t) => {
  const workerProfile = fakeWorkerProfile();
  const voiceProfile = { _id: "VP001", language: "hi", status: "committed", save: async function () { return this; } };

  const voiceProfileFindOneMock = mockOwnedVoiceProfile(voiceProfile);
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => workerProfile);
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const categoryFindMock = mock.method(JobCategory, "find", async () => []);
  const workerSkillUpsertMock = mock.method(WorkerSkill, "findOneAndUpdate", async () => ({}));

  t.after(() => {
    voiceProfileFindOneMock.mock.restore();
    workerFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    categoryFindMock.mock.restore();
    workerSkillUpsertMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: {
      voiceProfileId: "VP001",
      confirmedFields: { skills: ["plumber"] }, // alias, not the catalog's exact "Plumbing" name
    },
  });

  confirmAndApplyToProfile(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(workerSkillUpsertMock.mock.callCount(), 1);
  const [filter, update] = workerSkillUpsertMock.mock.calls[0].arguments;
  assert.strictEqual(filter.skillId, "SKILL_PLUMBING");
  assert.strictEqual(update.$setOnInsert.proficiency, "intermediate");
  assert.strictEqual(res.body.data.voiceSkillResolution.skills.resolved[0].canonicalName, "Plumbing");
  assert.deepStrictEqual(res.body.data.voiceSkillResolution.skills.unresolved, []);
});

test("confirmAndApplyToProfile: an unrecognized skill stays as unresolved free text, no WorkerSkill created", async (t) => {
  const workerProfile = fakeWorkerProfile();
  const voiceProfile = { _id: "VP001", language: "hi", status: "committed", save: async function () { return this; } };

  const voiceProfileFindOneMock = mockOwnedVoiceProfile(voiceProfile);
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => workerProfile);
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const categoryFindMock = mock.method(JobCategory, "find", async () => []);
  const workerSkillUpsertMock = mock.method(WorkerSkill, "findOneAndUpdate", async () => ({}));
  // "electrician" isn't in the catalog, so Stage 1 leaves it unresolved and
  // the controller falls through to Stage 2 (semantic resolution) - mocked
  // here to also correctly report it unresolved, keeping this test offline.
  const restoreFetch = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          rawSkill: "electrician",
          resolved: false,
          canonicalSkillId: null,
          canonicalSkillName: null,
          confidence: 0,
          reason: "no catalog match",
        },
      ],
    }),
  }));

  t.after(() => {
    voiceProfileFindOneMock.mock.restore();
    workerFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    categoryFindMock.mock.restore();
    workerSkillUpsertMock.mock.restore();
    restoreFetch();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    // No Electrician skill exists in the (fake, mirroring real) catalog -
    // this must NOT be force-matched to Plumbing or Masonry, even through
    // Stage 2 semantic resolution.
    body: { voiceProfileId: "VP001", confirmedFields: { skills: ["electrician"] } },
  });

  confirmAndApplyToProfile(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(workerSkillUpsertMock.mock.callCount(), 0);
  assert.deepStrictEqual(res.body.data.voiceSkillResolution.skills.unresolved, ["electrician"]);
  assert.deepStrictEqual(res.body.data.voiceSkillResolution.skills.resolved, []);
});

test("confirmAndApplyToProfile: duplicate extracted skills resolving to the same catalog skill create only one WorkerSkill", async (t) => {
  const workerProfile = fakeWorkerProfile();
  const voiceProfile = { _id: "VP001", language: "en", status: "committed", save: async function () { return this; } };

  const voiceProfileFindOneMock = mockOwnedVoiceProfile(voiceProfile);
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => workerProfile);
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const categoryFindMock = mock.method(JobCategory, "find", async () => []);
  const workerSkillUpsertMock = mock.method(WorkerSkill, "findOneAndUpdate", async () => ({}));

  t.after(() => {
    voiceProfileFindOneMock.mock.restore();
    workerFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    categoryFindMock.mock.restore();
    workerSkillUpsertMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: {
      voiceProfileId: "VP001",
      // "plumber" (alias), "Plumbing" (different capitalization), and
      // "plumbing" (exact) all resolve to the same catalog skill.
      confirmedFields: { skills: ["plumber", "Plumbing", "plumbing"] },
    },
  });

  confirmAndApplyToProfile(req, res, next);
  await done;

  assert.strictEqual(workerSkillUpsertMock.mock.callCount(), 1);
  assert.strictEqual(res.body.data.voiceSkillResolution.skills.resolved.length, 1);
});

test("confirmAndApplyToProfile: preferredJobCategories resolve and append without duplicating existing ones", async (t) => {
  const workerProfile = fakeWorkerProfile({ preferredJobCategories: ["CAT_CONSTRUCTION"] });
  const voiceProfile = { _id: "VP001", language: "en", status: "committed", save: async function () { return this; } };

  const voiceProfileFindOneMock = mockOwnedVoiceProfile(voiceProfile);
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => workerProfile);
  const skillFindMock = mock.method(Skill, "find", async () => []);
  const categoryFindMock = mock.method(JobCategory, "find", async () => FAKE_CATEGORIES);

  t.after(() => {
    voiceProfileFindOneMock.mock.restore();
    workerFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    categoryFindMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: {
      voiceProfileId: "VP001",
      // Already-linked category must not be duplicated; an unknown one
      // must stay unresolved.
      confirmedFields: { preferredJobCategories: ["construction work", "deep sea fishing"] },
    },
  });

  confirmAndApplyToProfile(req, res, next);
  await done;

  assert.deepStrictEqual(workerProfile.preferredJobCategories, ["CAT_CONSTRUCTION"]);
  assert.deepStrictEqual(res.body.data.voiceSkillResolution.preferredJobCategories.unresolved, [
    "deep sea fishing",
  ]);
});

test("confirmAndApplyToProfile: an existing worker's already-linked skill is not duplicated or reset", async (t) => {
  const workerProfile = fakeWorkerProfile();
  const voiceProfile = { _id: "VP001", language: "en", status: "committed", save: async function () { return this; } };

  const voiceProfileFindOneMock = mockOwnedVoiceProfile(voiceProfile);
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => workerProfile);
  const skillFindMock = mock.method(Skill, "find", async () => FAKE_SKILLS);
  const categoryFindMock = mock.method(JobCategory, "find", async () => []);
  // upsert semantics: findOneAndUpdate with $setOnInsert is itself what
  // guarantees an existing WorkerSkill's proficiency/verificationStatus is
  // left untouched - this test confirms the controller calls it with
  // exactly that shape (upsert:true, only $setOnInsert, no direct $set).
  const workerSkillUpsertMock = mock.method(WorkerSkill, "findOneAndUpdate", async () => ({
    _id: "WS001",
    proficiency: "expert",
    verificationStatus: "verified",
  }));

  t.after(() => {
    voiceProfileFindOneMock.mock.restore();
    workerFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    categoryFindMock.mock.restore();
    workerSkillUpsertMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { voiceProfileId: "VP001", confirmedFields: { skills: ["plumber"] } },
  });

  confirmAndApplyToProfile(req, res, next);
  await done;

  const [, update, options] = workerSkillUpsertMock.mock.calls[0].arguments;
  assert.strictEqual(options.upsert, true);
  assert.deepStrictEqual(Object.keys(update), ["$setOnInsert"]);
});

test("confirmAndApplyToProfile: a worker with no extracted skills triggers no WorkerSkill lookups", async (t) => {
  const workerProfile = fakeWorkerProfile();
  const voiceProfile = { _id: "VP001", language: "en", status: "committed", save: async function () { return this; } };

  const voiceProfileFindOneMock = mockOwnedVoiceProfile(voiceProfile);
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => workerProfile);
  const skillFindMock = mock.method(Skill, "find", async () => {
    throw new Error("should not be called when no skills were extracted");
  });
  const workerSkillUpsertMock = mock.method(WorkerSkill, "findOneAndUpdate", async () => ({}));

  t.after(() => {
    voiceProfileFindOneMock.mock.restore();
    workerFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    workerSkillUpsertMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { voiceProfileId: "VP001", confirmedFields: { fullName: "Rahul" } },
  });

  confirmAndApplyToProfile(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(workerSkillUpsertMock.mock.callCount(), 0);
  assert.deepStrictEqual(res.body.data.voiceSkillResolution.skills, { resolved: [], unresolved: [] });
});


// =============================================================================
// An empty recording is bad input, not a server fault.
//
// MediaRecorder yields a zero-byte Blob when a recording is stopped before
// any audio chunk arrives (a quick tap on Record). AudioUploader already
// rejects empty *files* client-side, but nothing guarded an empty
// *recording*: it reached Whisper, failed there, and surfaced as a 500
// "Failed to process voice recording" - a generic error the worker cannot
// act on. It must be a 400 that says what to do instead.
// =============================================================================

test("uploadAudioAndExtract: a zero-byte recording is rejected with 400, before any AI call", async (t) => {
  const tempFilePath = new URL("./fixtures/empty-recording-test.webm", import.meta.url).pathname;
  fs.writeFileSync(tempFilePath, Buffer.alloc(0));

  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WORKER001" }));
  const restoreFetch = mockFetchOnce(async () => {
    throw new Error("the AI service must not be called for an empty recording");
  });
  t.after(() => {
    workerFindOneMock.mock.restore();
    restoreFetch();
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { language: "mr" },
    file: { path: tempFilePath, size: 0, originalname: "blob", mimetype: "audio/webm" },
  });
  uploadAudioAndExtract(req, res, next);
  const { error } = await done;

  assert.ok(error, "an empty recording must be rejected");
  assert.strictEqual(error.statusCode, 400, "bad input is a 400, never a 500");
  assert.match(error.message, /recording is empty/i);
  assert.match(error.message, /record again/i, "the message must tell the worker what to do");
  assert.strictEqual(fs.existsSync(tempFilePath), false, "the temp file must still be cleaned up");
});

test("uploadAudioAndExtract: a non-empty recording is still processed normally", async (t) => {
  const tempFilePath = new URL("./fixtures/nonempty-recording-test.webm", import.meta.url).pathname;
  fs.writeFileSync(tempFilePath, Buffer.from([1, 2, 3, 4]));

  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WORKER001" }));
  const voiceUpsertMock = mock.method(VoiceProfile, "findOneAndUpdate", async (_f, update) => ({ _id: "VP1", ...update }));
  const restoreFetch = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({ transcript: "ok", extracted_profile: VALID_EXTRACTION, confidence: 0.9 }),
  }));
  t.after(() => {
    workerFindOneMock.mock.restore();
    voiceUpsertMock.mock.restore();
    restoreFetch();
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { language: "mr" },
    file: { path: tempFilePath, size: 4, originalname: "blob", mimetype: "audio/webm" },
  });
  uploadAudioAndExtract(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null, "a real recording must not be blocked by the empty-file guard");
  assert.strictEqual(res.statusCode, 200);
});
