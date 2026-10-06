/**
 * Real-MongoDB test for the rating aggregate (MODULE 5).
 *
 * The mocked suite (tests/rating.module5.test.js) proves the controller SENDS
 * a single-stage update pipeline. Only a real database can prove:
 *
 *   - MongoDB's arithmetic produces the averages we claim (5 -> 5.00,
 *     5+1 -> 3.00, 5+4+3 -> 4.00, 1..5 -> 3.00), including the 2dp rounding;
 *   - every expression in one $set stage really does read the PRE-update
 *     document, which is the whole reason the pattern is safe;
 *   - concurrent ratings for the same profile lose nothing. The read ->
 *     modify in JS -> save() code this replaced was measured losing one of
 *     four concurrent updates (ratingCount=3, ratingAvg=3.67 for four
 *     ratings whose true average is 3.50).
 *
 * Kept in tests/integration/ (not run by `node --test tests/*.test.js`)
 * because it needs a live MongoDB. Uses its own throwaway database, dropped
 * afterward - never the development database.
 *
 *   cd backend2 && node --test tests/integration/ratingAggregate.integration.test.js
 */

import test from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import WorkerProfile from "../../src/models/workerProfile.model.js";
import EmployerProfile from "../../src/models/employerProfile.model.js";

const TEST_DB = "LokRozgar_AI_m5_aggregate_isolated_test";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

test.before(async () => {
  await mongoose.connect(`${MONGODB_URI}/${TEST_DB}`);
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const id = () => new mongoose.Types.ObjectId();

/**
 * The pipeline the controller builds, duplicated here on purpose: this file
 * exists to measure what MongoDB DOES with these expressions, and importing
 * a half-built request's internals is not possible without a full HTTP
 * round-trip. tests/rating.module5.test.js is what pins the controller to
 * this exact shape, so the two cannot silently drift apart.
 */
function ratingPipeline(score) {
  return [
    {
      $set: {
        ratingAvg: {
          $round: [
            {
              $divide: [
                {
                  $add: [
                    { $multiply: [{ $ifNull: ["$ratingAvg", 0] }, { $ifNull: ["$ratingCount", 0] }] },
                    score,
                  ],
                },
                { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] },
              ],
            },
            2,
          ],
        },
        ratingCount: { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] },
      },
    },
  ];
}

function applyRating(Model, userId, score) {
  return Model.findOneAndUpdate({ userId }, ratingPipeline(score), {
    returnDocument: "after",
    updatePipeline: true,
  });
}

async function createWorkerProfile() {
  const userId = id();
  await WorkerProfile.create({
    userId,
    fullName: "M5 Aggregate Test Worker",
    location: { type: "Point", coordinates: [72.88, 19.08] },
  });
  return userId;
}

async function createEmployerProfile() {
  const userId = id();
  await EmployerProfile.create({
    userId,
    businessName: "M5 Aggregate Test Employer",
    businessType: "construction",
    location: { type: "Point", coordinates: [72.88, 19.08] },
  });
  return userId;
}

// --- 1. The averaging sequences from the module spec -------------------------

const SEQUENCES = [
  { scores: [5], expectedAvg: 5, label: "a single 5-star rating" },
  { scores: [5, 1], expectedAvg: 3, label: "5 then 1" },
  { scores: [5, 4, 3], expectedAvg: 4, label: "5, 4 then 3" },
  { scores: [1, 2, 3, 4, 5], expectedAvg: 3, label: "every star once" },
  { scores: [4, 5], expectedAvg: 4.5, label: "a .5 average" },
  { scores: [5, 4, 4], expectedAvg: 4.33, label: "a repeating decimal, rounded to 2dp" },
];

for (const { scores, expectedAvg, label } of SEQUENCES) {
  test(`aggregate: ${label} -> avg ${expectedAvg}, count ${scores.length}`, async () => {
    const userId = await createWorkerProfile();

    let profile = null;
    for (const score of scores) {
      profile = await applyRating(WorkerProfile, userId, score);
    }

    assert.strictEqual(profile.ratingCount, scores.length);
    assert.strictEqual(profile.ratingAvg, expectedAvg);

    // And the stored document agrees with what findOneAndUpdate returned.
    const reread = await WorkerProfile.findOne({ userId });
    assert.strictEqual(reread.ratingCount, scores.length);
    assert.strictEqual(reread.ratingAvg, expectedAvg);
  });
}

test("aggregate: a cold profile starts at 0/0 and the first rating does not divide by zero", async () => {
  const userId = await createWorkerProfile();
  const cold = await WorkerProfile.findOne({ userId });
  assert.strictEqual(cold.ratingAvg, 0);
  assert.strictEqual(cold.ratingCount, 0);

  const after = await applyRating(WorkerProfile, userId, 3);
  assert.strictEqual(after.ratingAvg, 3);
  assert.strictEqual(after.ratingCount, 1);
});

test("aggregate: $ifNull covers a profile whose aggregate fields were never set at all", async () => {
  // A document written before the aggregate fields existed, or by a raw
  // driver insert that skipped the schema defaults.
  const userId = id();
  await WorkerProfile.collection.insertOne({
    userId,
    fullName: "M5 Legacy Worker",
    location: { type: "Point", coordinates: [72.88, 19.08] },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const after = await applyRating(WorkerProfile, userId, 4);
  assert.strictEqual(after.ratingAvg, 4, "a missing ratingAvg must read as 0, not produce null/NaN");
  assert.strictEqual(after.ratingCount, 1);
});

test("aggregate: the employer direction behaves identically", async () => {
  const userId = await createEmployerProfile();
  await applyRating(EmployerProfile, userId, 2);
  const after = await applyRating(EmployerProfile, userId, 5);
  assert.strictEqual(after.ratingCount, 2);
  assert.strictEqual(after.ratingAvg, 3.5);
});

test("aggregate: an unknown userId matches nothing and creates no document", async () => {
  const before = await WorkerProfile.countDocuments();
  const result = await applyRating(WorkerProfile, id(), 5);
  assert.strictEqual(result, null, "no upsert - a rating never conjures a profile");
  assert.strictEqual(await WorkerProfile.countDocuments(), before);
});

// --- 2. The lost-update regression ------------------------------------------

test("aggregate: 4 CONCURRENT ratings are all counted - the measured lost update does not recur", async () => {
  const userId = await createWorkerProfile();
  const scores = [5, 4, 3, 2]; // true average 3.50

  await Promise.all(scores.map((score) => applyRating(WorkerProfile, userId, score)));

  const profile = await WorkerProfile.findOne({ userId });
  assert.strictEqual(profile.ratingCount, 4, "the exact symptom of the old bug was ratingCount=3 here");
  assert.strictEqual(profile.ratingAvg, 3.5, "the old code stored 3.67 - an average over 3 of the 4 ratings");
});

test("aggregate: 25 concurrent ratings of mixed scores stay exactly consistent", async () => {
  const userId = await createWorkerProfile();
  const scores = Array.from({ length: 25 }, (_, index) => (index % 5) + 1); // 1..5 x5, mean 3
  await Promise.all(scores.map((score) => applyRating(WorkerProfile, userId, score)));

  const profile = await WorkerProfile.findOne({ userId });
  assert.strictEqual(profile.ratingCount, 25);
  // Order of interleaving does not affect the final mean, only intermediate
  // rounding - which is why a 2dp tolerance is the honest assertion here.
  assert.ok(
    Math.abs(profile.ratingAvg - 3) < 0.01,
    `expected the mean to converge on 3, got ${profile.ratingAvg}`
  );
});

test("aggregate: the stored average never leaves the schema's 0..5 bounds under concurrency", async () => {
  const userId = await createWorkerProfile();
  await Promise.all([5, 5, 5, 1, 1, 1].map((score) => applyRating(WorkerProfile, userId, score)));
  const profile = await WorkerProfile.findOne({ userId });
  assert.ok(profile.ratingAvg >= 0 && profile.ratingAvg <= 5, `ratingAvg out of schema bounds: ${profile.ratingAvg}`);
  assert.strictEqual(profile.ratingCount, 6);
  assert.strictEqual(profile.ratingAvg, 3);
});
