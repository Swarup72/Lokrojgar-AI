/**
 * Real-MongoDB test: employer-initiated job requests cannot over-hire a job.
 *
 * This is the guarantee the retired /offers path did NOT have. Measured against
 * that path before it was removed: an employer sent requests to three workers
 * for a job with requiredWorkers=1, all three accepted, and the job ended with
 * filledWorkers=3 and three accepted applications - because accepting an offer
 * called the uncapped incrementFilledWorkers instead of reserving a slot.
 *
 * Employer-initiated hiring is now an Application with status "invited", and
 * accepting one goes through acceptApplicationAtomically() - the same
 * reserveWorkerSlot reservation an employer accepting an application uses. Only
 * a real database can prove the reservation holds under genuine concurrency.
 *
 * Kept in tests/integration/ (not run by `node --test tests/*.test.js`) because
 * it needs a live MongoDB. Uses its own throwaway database, dropped afterward.
 *
 *   cd backend2 && node --test tests/integration/jobRequestCapacity.integration.test.js
 */

import test from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import Job from "../../src/models/job.model.js";
import Application from "../../src/models/application.model.js";
import { reserveWorkerSlot } from "../../src/utils/jobAssignment.js";

const TEST_DB = "LokRozgar_AI_jobrequest_isolated_test";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

test.before(async () => {
  await mongoose.connect(`${MONGODB_URI}/${TEST_DB}`);
  // Mongoose builds indexes in the BACKGROUND after connecting, so a test that
  // asserts an index-backed guarantee has to wait for it - otherwise it races
  // the build and can insert duplicates that the index would have rejected.
  // (That race is what made this file pass alone and fail when run alongside
  // the other integration files, which delayed the build further.) init()
  // resolves once this model's indexes exist.
  await Application.init();
  await Job.init();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const id = () => new mongoose.Types.ObjectId();

async function createJob(requiredWorkers) {
  return Job.create({
    employerId: id(),
    title: { en: "Job request capacity test" },
    location: { type: "Point", coordinates: [72.88, 19.08] },
    payType: "daily",
    payAmount: 900,
    requiredWorkers,
    startDate: new Date("2026-12-01"),
    categoryId: id(),
    originalLanguage: "en",
  });
}

async function inviteWorkers(job, count) {
  const invitations = [];
  for (let index = 0; index < count; index += 1) {
    invitations.push(
      await Application.create({
        jobId: job._id,
        workerId: id(),
        status: "invited",
        initiatedBy: "employer",
      })
    );
  }
  return invitations;
}

/**
 * The acceptance path a worker's "Accept" takes, reduced to its two writes.
 * Mirrors acceptApplicationAtomically() in application.controller.js - reserve
 * the slot FIRST, then transition conditionally, and release the reservation if
 * the transition did not happen.
 */
async function acceptInvitation(application) {
  const job = await reserveWorkerSlot(application.jobId);
  if (!job) return { accepted: false, reason: "full" };

  const transitioned = await Application.findOneAndUpdate(
    { _id: application._id, status: { $ne: "accepted" } },
    { $set: { status: "accepted", respondedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!transitioned) {
    // Lost the race for this same application - hand the slot back.
    await Job.findOneAndUpdate(
      { _id: application.jobId, filledWorkers: { $gt: 0 } },
      { $inc: { filledWorkers: -1 } }
    );
    return { accepted: false, reason: "already-answered" };
  }
  return { accepted: true };
}

test("3 workers accepting requests for a 1-worker job: at most ONE is hired", async () => {
  const job = await createJob(1);
  const invitations = await inviteWorkers(job, 3);

  const results = await Promise.all(invitations.map((invitation) => acceptInvitation(invitation)));

  const finalJob = await Job.findById(job._id);
  const acceptedCount = await Application.countDocuments({ jobId: job._id, status: "accepted" });

  assert.strictEqual(
    finalJob.filledWorkers,
    1,
    `the retired /offers path left filledWorkers=3 here; got ${finalJob.filledWorkers}`
  );
  assert.strictEqual(acceptedCount, 1, "exactly one accepted application");
  assert.strictEqual(results.filter((r) => r.accepted).length, 1, "exactly one caller was told it succeeded");
  assert.ok(finalJob.filledWorkers <= finalJob.requiredWorkers);
});

test("5 workers accepting requests for a 2-worker job: exactly TWO are hired", async () => {
  const job = await createJob(2);
  const invitations = await inviteWorkers(job, 5);

  const results = await Promise.all(invitations.map((invitation) => acceptInvitation(invitation)));

  const finalJob = await Job.findById(job._id);
  const acceptedCount = await Application.countDocuments({ jobId: job._id, status: "accepted" });

  assert.strictEqual(finalJob.filledWorkers, 2);
  assert.strictEqual(acceptedCount, 2);
  assert.strictEqual(results.filter((r) => r.accepted).length, 2);
  // Two workers fill the job, so it must be "assigned", not "partially_assigned".
  assert.strictEqual(finalJob.status, "assigned");
});

test("the SAME worker accepting one request 4 times concurrently is hired once", async () => {
  const job = await createJob(3);
  const [invitation] = await inviteWorkers(job, 1);

  const results = await Promise.all([1, 2, 3, 4].map(() => acceptInvitation(invitation)));

  const finalJob = await Job.findById(job._id);
  assert.strictEqual(finalJob.filledWorkers, 1, "a repeated accept must not consume extra slots");
  assert.strictEqual(results.filter((r) => r.accepted).length, 1);
  assert.strictEqual(await Application.countDocuments({ jobId: job._id, status: "accepted" }), 1);
});

test("a mix of invitation accepts and application accepts shares ONE capacity pool", async () => {
  // The whole point of using one Application collection: both directions draw
  // from the same filledWorkers counter, so they cannot each fill the job.
  const job = await createJob(2);
  const invited = await inviteWorkers(job, 2);
  const applied = [
    await Application.create({ jobId: job._id, workerId: id(), status: "applied", initiatedBy: "worker" }),
    await Application.create({ jobId: job._id, workerId: id(), status: "applied", initiatedBy: "worker" }),
  ];

  const results = await Promise.all([...invited, ...applied].map((app) => acceptInvitation(app)));

  const finalJob = await Job.findById(job._id);
  assert.strictEqual(finalJob.filledWorkers, 2, "four acceptances, two slots");
  assert.strictEqual(results.filter((r) => r.accepted).length, 2);
  assert.strictEqual(await Application.countDocuments({ jobId: job._id, status: "accepted" }), 2);
});

test("the unique {jobId, workerId} index makes a duplicate request impossible", async () => {
  const job = await createJob(1);
  const workerId = id();
  await Application.create({ jobId: job._id, workerId, status: "invited", initiatedBy: "employer" });

  // Concurrent duplicate sends: all but one must fail with E11000, which the
  // controller converts to 409 (the retired /offers path returned 500 here).
  const outcomes = await Promise.allSettled(
    [1, 2, 3].map(() =>
      Application.create({ jobId: job._id, workerId, status: "invited", initiatedBy: "employer" })
    )
  );

  assert.strictEqual(outcomes.filter((o) => o.status === "fulfilled").length, 0);
  for (const outcome of outcomes) {
    assert.strictEqual(outcome.reason.code, 11000, "must be a duplicate-key error, not something else");
  }
  assert.strictEqual(await Application.countDocuments({ jobId: job._id, workerId }), 1);
});
