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

test("uploadAudioAndExtract: transcription reads the local file BEFORE it is deleted, and cleans up afterward", async (t) => {
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
  const b2Client = getB2Client();
  const uploadMock = mock.method(b2Client, "send", async (command) => {
    callOrder.push("upload");
    // The real uploadAudioToB2 (utils/b2.js) reads the file into memory
    // itself before calling this - it does NOT delete the local file (that
    // is the controller's job, in its finally block), so nothing here needs
    // to reproduce a deletion side effect the way the old Cloudinary mock did.
    assert.strictEqual(command.constructor.name, "PutObjectCommand");
    return { ETag: '"fake-etag"' };
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
  assert.deepStrictEqual(callOrder, ["transcribe+extract", "upload"]);
  assert.strictEqual(fs.existsSync(tempFilePath), false, "temp file must be cleaned up after success");
  assert.strictEqual(res.body.data.confidence, 0.9);
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

test("confirmAndApplyToProfile: applies availability and languages, but NOT skills/preferredJobCategories", async (t) => {
  const workerProfile = {
    userId: "USER001",
    fullName: "Old Name",
    bio: {},
    availability: "unavailable",
    languages: ["en"],
    save: async function () {
      return this;
    },
  };
  const voiceProfile = { _id: "VP001", language: "mr" };

  const voiceProfileFindByIdMock = mock.method(VoiceProfile, "findById", async () => voiceProfile);
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => workerProfile);

  t.after(() => {
    voiceProfileFindByIdMock.mock.restore();
    workerFindOneMock.mock.restore();
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
        skills: ["plumbing"], // must be ignored - see migration report
        preferredJobCategories: ["construction"], // must be ignored
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
  // Confirms the deliberate scope boundary: no skills/preferredJobCategories
  // field exists on WorkerProfile to have been mutated in the first place,
  // and nothing in the controller attempted to touch WorkerSkill/Skill.
  assert.strictEqual(workerProfile.skills, undefined);
  assert.strictEqual(workerProfile.preferredJobCategories, undefined);
});
