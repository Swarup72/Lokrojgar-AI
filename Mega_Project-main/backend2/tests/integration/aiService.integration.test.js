/**
 * Real end-to-end integration test: Node -> FastAPI -> Python AI.
 *
 * Unlike every other test in this repo, this one makes a REAL HTTP call to
 * a REAL running FastAPI process - nothing is mocked. It is intentionally
 * kept in tests/integration/ (not tests/*.test.js) so the default
 * `node --test tests/*.test.js` command never depends on FastAPI being up.
 *
 * Run manually, with the AI service already running:
 *
 *   cd ai-service && .venv/bin/uvicorn app.main:app --port 8000 &
 *   cd backend2 && node --test tests/integration/aiService.integration.test.js
 */

import test from "node:test";
import assert from "node:assert";
import {
  getRecommendedJobsForWorker,
  getRecommendedWorkersForJob,
  scoreWorkerJobPair,
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
