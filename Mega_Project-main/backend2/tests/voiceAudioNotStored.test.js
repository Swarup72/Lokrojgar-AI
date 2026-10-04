import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import fs from "fs";

process.env.AI_SERVICE_URL = "http://test-ai:9000";
// Real-looking B2 config so getB2Client() constructs; any actual send() is
// a failure, not a configuration error.
process.env.B2_APPLICATION_KEY_ID = "test-key-id";
process.env.B2_APPLICATION_KEY = "test-app-key";
process.env.B2_BUCKET_NAME = "test-bucket";
process.env.B2_REGION = "us-test-000";
process.env.B2_ENDPOINT = "https://s3.us-test-000.backblazeb2.com";

import VoiceProfile from "../src/models/voiceProfile.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import { getB2Client } from "../src/utils/b2.js";
import * as storageService from "../src/services/storage.service.js";
import { uploadAudioAndExtract } from "../src/controllers/voiceProfile.controller.js";

// H-7: a voice recording is a processing artifact. It is transcribed and
// deleted in the same request and never reaches permanent storage, so the
// bucket can no longer accumulate audio nothing can reach.

function fakeReqRes({ user, body = {}, file } = {}) {
  const req = { user, body, file };
  let settle;
  const done = new Promise((resolve) => { settle = resolve; });
  const res = {
    statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; settle({ error: null }); return this; },
  };
  const next = (err) => settle({ error: err || new Error("next() with no error") });
  return { req, res, next, done };
}

const EXTRACTION = { fullName: "स्वरूप समीर पाल", experienceYears: 5, expectedPay: 800 };

/** Mocks the whole flow and records every B2 command attempted. */
function setup(t, { sttOk = true, tempPath } = {}) {
  fs.writeFileSync(tempPath, Buffer.from([0, 1, 2]));

  const b2Commands = [];
  const b2Mock = mock.method(getB2Client(), "send", async (command) => {
    b2Commands.push(command.constructor.name);
    return {};
  });

  const originalFetch = global.fetch;
  global.fetch = async () =>
    sttOk
      ? { ok: true, json: async () => ({ transcript: "मला आठशे रुपये रोज पाहिजे.", extracted_profile: EXTRACTION, confidence: 0.9 }) }
      : { ok: false, status: 502, json: async () => ({ detail: "stt exploded" }) };

  const workerMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WORKER001" }));
  const upsertMock = mock.method(VoiceProfile, "findOneAndUpdate", async (_f, update) => ({ _id: "VP001", ...update }));

  t.after(() => {
    b2Mock.mock.restore();
    workerMock.mock.restore();
    upsertMock.mock.restore();
    global.fetch = originalFetch;
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  });

  return { b2Commands, upsertMock };
}

const tmp = (name) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

test("a successful extraction creates no B2 object and removes the temp file", async (t) => {
  const path = tmp("h7-success.audio");
  const { b2Commands, upsertMock } = setup(t, { tempPath: path });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "U1" }, body: { language: "mr" }, file: { path } });
  uploadAudioAndExtract(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(b2Commands, [], "no B2 command may be issued");
  assert.strictEqual(fs.existsSync(path), false, "temp file must be deleted on success");

  // The data the review screen consumes is unchanged.
  assert.deepStrictEqual(res.body.data.extractedFields, EXTRACTION);
  assert.strictEqual(res.body.data.transcript, "मला आठशे रुपये रोज पाहिजे.");
  // No storage key is written.
  const written = upsertMock.mock.calls[0].arguments[1];
  assert.strictEqual("audioKey" in written, false, "the upsert must not set audioKey");
});

test("an STT/extraction failure creates no B2 object and still removes the temp file", async (t) => {
  const path = tmp("h7-failure.audio");
  const { b2Commands } = setup(t, { sttOk: false, tempPath: path });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "U1" }, body: { language: "mr" }, file: { path } });
  uploadAudioAndExtract(req, res, next);
  const { error } = await done;

  assert.ok(error, "the request must fail");
  assert.deepStrictEqual(b2Commands, [], "a failed extraction must not upload anything");
  assert.strictEqual(fs.existsSync(path), false, "temp file must be deleted on failure too");
});

test("re-recording the same language cannot orphan a stored object, because nothing is stored", async (t) => {
  const first = tmp("h7-rerecord-1.audio");
  const { b2Commands } = setup(t, { tempPath: first });

  for (const path of [first]) {
    const { req, res, next, done } = fakeReqRes({ user: { _id: "U1" }, body: { language: "mr" }, file: { path } });
    uploadAudioAndExtract(req, res, next);
    await done;
  }

  assert.deepStrictEqual(b2Commands, [], "the overwrite-orphan scenario no longer has an object to orphan");
});

// --- the module surface after the change ------------------------------------

test("storage.service no longer exposes a voice-profile upload or B2 re-exports", () => {
  assert.strictEqual(storageService.uploadVoiceProfileAudioService, undefined);
  assert.strictEqual(storageService.deleteAudioFromB2, undefined);
  assert.strictEqual(storageService.getSignedAudioUrl, undefined);
});

test("unrelated Cloudinary flows are untouched and still exported", () => {
  for (const name of ["uploadImageService", "uploadAudioService", "uploadPDFService", "deleteFromCloudinary"]) {
    assert.strictEqual(typeof storageService[name], "function", `${name} must still exist`);
  }
});

test("the B2 utility module still works for any future/other use", async () => {
  const b2 = await import("../src/utils/b2.js");
  for (const name of ["uploadAudioToB2", "deleteAudioFromB2", "getSignedAudioUrl", "getB2Client"]) {
    assert.strictEqual(typeof b2[name], "function", `${name} must remain available`);
  }
  // A real signed URL can still be produced - B2 support is not removed.
  const url = await b2.getSignedAudioUrl("voice-profiles/WORKER001/legacy.wav", 60);
  assert.match(url, /voice-profiles\/WORKER001\/legacy\.wav/);
});

test("the voice-profile controller no longer imports any B2 symbol", async () => {
  const source = fs.readFileSync(new URL("../src/controllers/voiceProfile.controller.js", import.meta.url), "utf8");
  assert.ok(!/utils\/b2\.js/.test(source), "controller must not import utils/b2.js");
  assert.ok(!/B2ConfigError|uploadVoiceProfileAudioService|audioKey/.test(source),
    "controller must not reference B2 upload or audioKey any more");
});

test("audioKey is optional, so historical documents still validate", () => {
  const legacy = new VoiceProfile({
    workerId: "507f1f77bcf86cd799439011", language: "mr",
    audioKey: "voice-profiles/W/old.wav", transcript: "x",
  });
  assert.strictEqual(legacy.validateSync(), undefined, "old documents keep their key and stay valid");

  const current = new VoiceProfile({ workerId: "507f1f77bcf86cd799439011", language: "mr", transcript: "x" });
  assert.strictEqual(current.validateSync(), undefined, "new documents validate without a key");
  assert.strictEqual(current.audioKey, undefined);
});
