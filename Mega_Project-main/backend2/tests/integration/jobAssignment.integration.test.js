/**
 * Real-MongoDB test for the atomic filledWorkers update (H-3).
 *
 * Mocked unit tests (tests/application.controller.test.js) prove the
 * controller issues a single pipeline update; only a real database can
 * prove MongoDB evaluates that pipeline with the same semantics the old JS
 * had, and that concurrent increments are never lost.
 *
 * Kept in tests/integration/ (not run by `node --test tests/*.test.js`)
 * because it needs a live MongoDB. Uses its own throwaway database, dropped
 * afterward - never the development database.
 *
 *   cd backend2 && node --test tests/integration/jobAssignment.integration.test.js
 */

import test from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import Job from "../../src/models/job.model.js";
import { incrementFilledWorkers } from "../../src/utils/jobAssignment.js";

const TEST_DB = "LokRozgar_AI_h3_isolated_test";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

test.before(async () => {
  await mongoose.connect(`${MONGODB_URI}/${TEST_DB}`);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createJob(requiredWorkers) {
  const id = () => new mongoose.Types.ObjectId();
  return Job.create({
    employerId: id(),
    title: { en: "H-3 test job" },
    location: { type: "Point", coordinates: [72.88, 19.08] },
    payType: "daily",
    payAmount: 900,
    requiredWorkers,
    startDate: new Date("2026-11-01"),
    categoryId: id(),
    originalLanguage: "en",
  });
}

test("status follows the same thresholds as the old JS logic, with no cap at requiredWorkers", async () => {
  const job = await createJob(2);
  assert.strictEqual(job.filledWorkers, 0);

  const first = await incrementFilledWorkers(job._id);
  assert.strictEqual(first.filledWorkers, 1);
  assert.strictEqual(first.status, "partially_assigned");

  const second = await incrementFilledWorkers(job._id);
  assert.strictEqual(second.filledWorkers, 2);
  assert.strictEqual(second.status, "assigned");

  // Existing behavior preserved: the old code never capped at requiredWorkers.
  const third = await incrementFilledWorkers(job._id);
  assert.strictEqual(third.filledWorkers, 3);
  assert.strictEqual(third.status, "assigned");
});

test("requiredWorkers = 1: the first acceptance moves the job straight to assigned", async () => {
  const job = await createJob(1);
  const updated = await incrementFilledWorkers(job._id);
  assert.strictEqual(updated.filledWorkers, 1);
  assert.strictEqual(updated.status, "assigned");
});

test("a missing filledWorkers value is treated as 0, matching the old `(filledWorkers || 0) + 1`", async () => {
  const job = await createJob(2);
  await Job.collection.updateOne({ _id: job._id }, { $unset: { filledWorkers: "" } });

  const updated = await incrementFilledWorkers(job._id);
  assert.strictEqual(updated.filledWorkers, 1);
  assert.strictEqual(updated.status, "partially_assigned");
});

test("concurrent increments are never lost, and final status is consistent with the final count", async () => {
  const CONCURRENT = 25;
  const job = await createJob(CONCURRENT);

  await Promise.all(Array.from({ length: CONCURRENT }, () => incrementFilledWorkers(job._id)));

  const final = await Job.findById(job._id);
  assert.strictEqual(final.filledWorkers, CONCURRENT, "every concurrent increment must be applied");
  assert.strictEqual(final.status, "assigned", "status must match the final count, not a stale intermediate");
});

test("a nonexistent job returns null and creates nothing", async () => {
  const result = await incrementFilledWorkers(new mongoose.Types.ObjectId());
  assert.strictEqual(result, null);
});
