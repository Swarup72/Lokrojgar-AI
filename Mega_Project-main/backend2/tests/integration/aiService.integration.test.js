/**
 * Real end-to-end integration test: Node -> FastAPI -> Python AI.
 *
 * Covers all three centralized AI features - recommendation, voice, and
 * translation. Unlike every other test in this repo, this one makes a REAL
 * HTTP call to a REAL running FastAPI process - nothing is mocked. It is
 * intentionally kept in tests/integration/ (not tests/*.test.js) so the
 * default `node --test tests/*.test.js` command never depends on FastAPI
 * being up.
 *
 * Run manually, with the AI service already running:
 *
 *   cd ai-service && .venv/bin/uvicorn app.main:app --port 8001 &
 *   cd backend2 && node --test tests/integration/aiService.integration.test.js
 *
 * The recommendation and translation tests talk to that shared instance.
 * The voice "provider unavailable" test spawns its own short-lived,
 * separately-ported instance instead (see withSarvamUnconfiguredAiService
 * below) so it stays deterministic regardless of whether the shared
 * instance's ai-service/.env has a real SARVAM_API_KEY configured.
 */

import test from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRecommendedJobsForWorker,
  getRecommendedWorkersForJob,
  scoreWorkerJobPair,
  forwardAudioForExtraction,
  translateText,
} from "../../src/services/aiService.client.js";

// Realistic, Node/Mongoose-shaped fixture data - camelCase, _id as plain
// strings (as they'd be once a real ObjectId is JSON-serialized).
const worker = {
  _id: "68b6f2c8a1234567890abcd",
  userId: "68b6f2c8a1234567890abce",
  fullName: "Ramesh Patil",
  bio: { en: "Experienced plumber", mr: "अनुभवी प्लंबर", hi: "अनुभवी प्लंबर" },
  location: { type: "Point", coordinates: [74.5815, 16.8524] },
  availability: "available",
  expectedPay: 800,
  ratingAvg: 0,
  ratingCount: 0,
  languages: ["mr", "hi", "en"],
  preferredJobCategories: ["68b6f31aa1234567890abcde"],
  preferredWorkRadiusKm: 25,
  experienceYears: 6,
};

const job = {
  _id: "68b6f31aa1234567890abcf1",
  employerId: "68b6f31aa1234567890abcf2",
  title: { en: "Plumber needed" },
  skillIds: ["68b6f31aa1234567890abcf3"],
  location: { type: "Point", coordinates: [74.59, 16.86] },
  payType: "daily",
  payAmount: 900,
  requiredWorkers: 1,
  filledWorkers: 0,
  status: "open",
  startDate: "2026-11-01T00:00:00.000Z",
  categoryId: "68b6f31aa1234567890abcde",
  originalLanguage: "en",
  experienceRequired: 2,
  preferredLanguages: ["en"],
  shiftType: "flexible",
};

test("integration: getRecommendedJobsForWorker returns a real ranked result from FastAPI", async () => {
  const result = await getRecommendedJobsForWorker({
    worker,
    workerSkills: [],
    jobs: [job],
    topK: 5,
  });

  assert.strictEqual(result.direction, "worker_to_jobs");
  assert.strictEqual(result.anchor_id, worker._id);
  assert.strictEqual(result.matches.length, 1);

  const match = result.matches[0];
  assert.strictEqual(match.job_id, job._id);
  assert.ok(typeof match.ranking.overall_score === "number");
  // Real, live proof (not mocked) that None survives the full HTTP round
  // trip rather than being coerced to 0.
  assert.strictEqual(match.ranking.match_factors.pay, null);
  assert.strictEqual(match.ranking.match_factors.rating, null);
});

test("integration: getRecommendedWorkersForJob returns a real ranked result from FastAPI", async () => {
  const result = await getRecommendedWorkersForJob({
    job,
    workers: [worker],
    workerSkills: [],
    topK: 5,
  });

  assert.strictEqual(result.direction, "job_to_workers");
  assert.strictEqual(result.anchor_id, job._id);
  assert.strictEqual(result.matches.length, 1);
  assert.strictEqual(result.matches[0].worker_id, worker._id);
});

test("integration: scoreWorkerJobPair returns ranking + explanation from FastAPI", async () => {
  const result = await scoreWorkerJobPair({ worker, workerSkills: [], job });

  assert.strictEqual(result.worker_id, worker._id);
  assert.strictEqual(result.job_id, job._id);
  assert.ok(result.ranking);
  assert.ok(result.explanation);
  assert.deepStrictEqual(
    result.explanation.factors.map((f) => f.factor),
    ["skill", "location", "availability", "pay", "rating", "relevance"]
  );
});

// --- Voice: provider-unavailable contract -----------------------------------
//
// This specifically tests "SARVAM_API_KEY not configured -> 503", which is a
// precondition of the AI SERVICE'S OWN environment, not of the request. The
// shared ai-service instance the tests above talk to may have a real
// SARVAM_API_KEY configured (e.g. for genuine manual end-to-end testing) - in
// that case /voice/extract legitimately reaches Sarvam's real API, and no
// choice of audio fixture can force a 503 out of it: real audio succeeds
// (200), garbage bytes are rejected by Sarvam's own validation (400
// invalid_request_error), and valid-but-silent audio yields an empty
// transcript (502) - never 503. All three are the error-mapping code
// working correctly, not a bug: a genuine provider response is always
// surfaced as its real status, distinct from "not configured".
//
// So proving the "not configured" contract deterministically - regardless of
// whatever real key ai-service/.env happens to have locally - requires an
// ai-service instance where SARVAM_API_KEY is provably absent. This spawns
// one: python-dotenv's load_dotenv() (app/main.py) never overrides an
// already-set environment variable, even an empty one (confirmed by direct
// testing), so setting SARVAM_API_KEY="" in the child process's env keeps it
// unconfigured no matter what .env contains.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_SERVICE_DIR = path.resolve(__dirname, "../../../ai-service");
const UNAVAILABLE_TEST_PORT = 8099;
const UNAVAILABLE_TEST_URL = `http://localhost:${UNAVAILABLE_TEST_PORT}`;

async function waitForHealth(url, retries = 50) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // Not up yet - keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`ai-service on ${url} did not become healthy in time`);
}

async function withSarvamUnconfiguredAiService(fn) {
  const child = spawn(
    path.join(AI_SERVICE_DIR, ".venv", "bin", "uvicorn"),
    ["app.main:app", "--port", String(UNAVAILABLE_TEST_PORT)],
    {
      cwd: AI_SERVICE_DIR,
      // STT_PROVIDER is pinned to "sarvam" here because ai-service now
      // defaults to the local Whisper provider, which never touches
      // SARVAM_API_KEY at all - without this override, the request below
      // would silently take the Whisper path instead of exercising the
      // "Sarvam not configured" contract this test is actually about.
      env: { ...process.env, SARVAM_API_KEY: "", AI_SERVICE_API_KEY: "", STT_PROVIDER: "sarvam" },
      stdio: "ignore",
    }
  );

  try {
    await waitForHealth(UNAVAILABLE_TEST_URL);
    await fn();
  } finally {
    child.kill();
  }
}

test("integration: forwardAudioForExtraction surfaces a real 503 when Sarvam is not configured", async () => {
  const originalUrl = process.env.AI_SERVICE_URL;
  process.env.AI_SERVICE_URL = UNAVAILABLE_TEST_URL;

  try {
    await withSarvamUnconfiguredAiService(async () => {
      await assert.rejects(
        () =>
          forwardAudioForExtraction({
            audioBuffer: Buffer.from("fake-audio-bytes-not-real-speech"),
            filename: "clip.wav",
            contentType: "audio/wav",
            language: "mr",
          }),
        (error) => {
          assert.strictEqual(error.statusCode, 503);
          return true;
        }
      );
    });
  } finally {
    if (originalUrl === undefined) delete process.env.AI_SERVICE_URL;
    else process.env.AI_SERVICE_URL = originalUrl;
  }
});

// --- Translation --------------------------------------------------------
// Round-trips through the shared, externally-run FastAPI process. Unlike
// voice, this doesn't require forcing "unavailable" deterministically:
// translateTextToAllLanguages() already falls back to source-text
// passthrough on ANY failure (see translation.service.js), so both a real
// translation (real key configured) and a 503 (no key) are equally valid,
// already-covered outcomes here - neither is a bug in the other's absence.

test("integration: translateText round-trips through a real FastAPI process", async () => {
  try {
    const result = await translateText({ text: "Hello", sourceLang: "en" });
    assert.strictEqual(result.en, "Hello");
    assert.ok(result.mr);
    assert.ok(result.hi);
  } catch (error) {
    assert.strictEqual(error.statusCode, 503);
  }
});
