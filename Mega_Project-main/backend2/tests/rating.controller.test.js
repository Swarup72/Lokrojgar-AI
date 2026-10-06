import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import Job from "../src/models/job.model.js";
import Application from "../src/models/application.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import Rating from "../src/models/rating.model.js";
import { submitRating } from "../src/controllers/rating.controller.js";

// Same fakeReqRes harness already used in voiceProfile.controller.test.js /
// auth.controller.test.js - following the project's existing conventions.
function fakeReqRes({ user, body = {} } = {}) {
  const req = { user, body };
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

const JOB_ID = "JOB001";
const EMPLOYER_PROFILE_ID = "EMPPROFILE001";
const EMPLOYER_USER = "EMPLOYER_USER";
const WORKER_PROFILE_A_ID = "WORKERPROFILE_A";
const WORKER_USER_A = "WORKER_USER_A";
const WORKER_PROFILE_B_ID = "WORKERPROFILE_B";
const WORKER_USER_B = "WORKER_USER_B";
const WORKER_PROFILE_C_ID = "WORKERPROFILE_C"; // exists, but NOT accepted on this job
const WORKER_USER_C = "WORKER_USER_C";
const UNRELATED_USER = "UNRELATED_USER";


/**
 * Emulates the atomic aggregate pipeline the controller now sends, and pins
 * its shape while doing so. Every expression in a single $set stage reads the
 * PRE-update document, which is exactly what makes concurrent ratings safe -
 * so this mock applies the formula against the values held before the call.
 */
function applyRatingPipeline(profile, pipeline) {
  assert.ok(Array.isArray(pipeline), "the aggregate update must be an update pipeline, not a JS-computed $set");
  assert.strictEqual(pipeline.length, 1, "ratingAvg and ratingCount must update in ONE atomic stage");
  const set = pipeline[0].$set;
  assert.ok(set.ratingAvg && set.ratingCount, "both ratingAvg and ratingCount must be set atomically");
  // The submitted score is the literal added to (ratingAvg * ratingCount).
  const score = set.ratingAvg.$round[0].$divide[0].$add[1];
  const oldCount = profile.ratingCount || 0;
  const oldAvg = profile.ratingAvg || 0;
  const newCount = oldCount + 1;
  profile.ratingCount = newCount;
  profile.ratingAvg = Math.round(((oldAvg * oldCount + score) / newCount) * 100) / 100;
  return profile;
}

function completedJob(overrides = {}) {
  return { _id: JOB_ID, status: "completed", employerId: EMPLOYER_PROFILE_ID, ...overrides };
}

function fakeProfile(userId, overrides = {}) {
  return {
    userId,
    ratingAvg: 0,
    ratingCount: 0,
    save: async function () {
      return this;
    },
    ...overrides,
  };
}

function acceptedApplication(jobId, workerProfile) {
  return { jobId, workerId: workerProfile, status: "accepted" };
}

/**
 * Sets up the standard mock scenario: one completed job, one employer, two
 * accepted workers (A, B), and a third worker (C) who exists but is NOT
 * accepted on this job - used across the "multiple accepted workers" tests.
 */
function mockStandardScenario(t, { rating = null, ratingFindOneImpl = null, ratingCreateImpl = null } = {}) {
  const employerProfile = fakeProfile(EMPLOYER_USER);
  const workerProfileA = fakeProfile(WORKER_USER_A);
  const workerProfileB = fakeProfile(WORKER_USER_B);

  const jobFindByIdMock = mock.method(Job, "findById", async () => completedJob());
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => employerProfile);
  const applicationFindMock = mock.method(Application, "find", () => ({
    populate: async () => [
      acceptedApplication(JOB_ID, { ...workerProfileA, _id: WORKER_PROFILE_A_ID }),
      acceptedApplication(JOB_ID, { ...workerProfileB, _id: WORKER_PROFILE_B_ID }),
    ],
  }));
  const ratingFindOneMock = mock.method(Rating, "findOne", ratingFindOneImpl || (async () => rating));
  const ratingCreateMock = mock.method(
    Rating,
    "create",
    ratingCreateImpl || (async (doc) => ({ _id: "RATING001", ...doc }))
  );
  const workerProfileFindOneMock = mock.method(WorkerProfile, "findOne", async ({ userId }) => {
    if (userId === WORKER_USER_A) return workerProfileA;
    if (userId === WORKER_USER_B) return workerProfileB;
    if (userId === WORKER_USER_C) return fakeProfile(WORKER_USER_C, { _id: WORKER_PROFILE_C_ID });
    return null;
  });
  const employerProfileFindOneMock = mock.method(EmployerProfile, "findOne", async ({ userId }) =>
    userId === EMPLOYER_USER ? employerProfile : null
  );
  // The aggregate is now a single atomic findOneAndUpdate, not findOne + save().
  const workerProfileUpdateMock = mock.method(WorkerProfile, "findOneAndUpdate", async ({ userId }, pipeline) => {
    if (userId === WORKER_USER_A) return applyRatingPipeline(workerProfileA, pipeline);
    if (userId === WORKER_USER_B) return applyRatingPipeline(workerProfileB, pipeline);
    return null;
  });
  const employerProfileUpdateMock = mock.method(EmployerProfile, "findOneAndUpdate", async ({ userId }, pipeline) =>
    userId === EMPLOYER_USER ? applyRatingPipeline(employerProfile, pipeline) : null
  );

  t.after(() => {
    jobFindByIdMock.mock.restore();
    employerFindByIdMock.mock.restore();
    applicationFindMock.mock.restore();
    ratingFindOneMock.mock.restore();
    workerProfileUpdateMock.mock.restore();
    employerProfileUpdateMock.mock.restore();
    ratingCreateMock.mock.restore();
    workerProfileFindOneMock.mock.restore();
    employerProfileFindOneMock.mock.restore();
  });

  return {
    employerProfile,
    workerProfileA,
    workerProfileB,
    ratingCreateMock,
    ratingFindOneMock,
    workerProfileUpdateMock,
    employerProfileUpdateMock,
  };
}

function failIfRatingCreateCalled(t) {
  const ratingCreateMock = mock.method(Rating, "create", async () => {
    throw new Error("Rating.create must NOT be called for an unauthorized request");
  });
  t.after(() => ratingCreateMock.mock.restore());
  return ratingCreateMock;
}

// --- 1. Unrelated authenticated user -----------------------------------------

test("submitRating: unrelated authenticated user is rejected, Rating.create never called", async (t) => {
  const jobFindByIdMock = mock.method(Job, "findById", async () => completedJob());
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => fakeProfile(EMPLOYER_USER));
  const workerProfileFindOneMock = mock.method(WorkerProfile, "findOne", async () => null);
  const ratingCreateMock = failIfRatingCreateCalled(t);
  t.after(() => {
    jobFindByIdMock.mock.restore();
    employerFindByIdMock.mock.restore();
    workerProfileFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: UNRELATED_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 5 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

// --- 2/11. Legitimate employer rates accepted worker A -----------------------

test("submitRating: employer rates accepted worker A, succeeds and updates worker's profile score", async (t) => {
  const { workerProfileA } = mockStandardScenario(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 4, review: "Good work" },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(workerProfileA.ratingCount, 1, "worker A's profile must be updated");
  assert.strictEqual(workerProfileA.ratingAvg, 4);
});

// --- 3. Legitimate accepted worker rates the employer ------------------------

test("submitRating: accepted worker rates the employer, succeeds and updates employer's profile score", async (t) => {
  const employerProfile = fakeProfile(EMPLOYER_USER);
  const workerProfileA = fakeProfile(WORKER_USER_A, { _id: WORKER_PROFILE_A_ID });

  const jobFindByIdMock = mock.method(Job, "findById", async () => completedJob());
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => employerProfile);
  const workerProfileFindOneMock = mock.method(WorkerProfile, "findOne", async ({ userId }) =>
    userId === WORKER_USER_A ? workerProfileA : null
  );
  // The worker direction must accept a COMPLETED application too - marking
  // the work finished must not make the job unrateable.
  const applicationFindOneMock = mock.method(Application, "findOne", async ({ workerId, status }) => {
    assert.deepStrictEqual(
      status,
      { $in: ["accepted", "completed"] },
      "the worker direction must query both rateable application statuses"
    );
    return workerId === WORKER_PROFILE_A_ID ? acceptedApplication(JOB_ID, workerProfileA) : null;
  });
  const ratingFindOneMock = mock.method(Rating, "findOne", async () => null);
  const ratingCreateMock = mock.method(Rating, "create", async (doc) => ({ _id: "RATING002", ...doc }));
  const employerProfileFindOneMock = mock.method(EmployerProfile, "findOne", async ({ userId }) =>
    userId === EMPLOYER_USER ? employerProfile : null
  );
  // The aggregate is now a single atomic findOneAndUpdate, not findOne + save().
  const workerProfileUpdateMock = mock.method(WorkerProfile, "findOneAndUpdate", async ({ userId }, pipeline) =>
    userId === WORKER_USER_A ? applyRatingPipeline(workerProfileA, pipeline) : null
  );
  const employerProfileUpdateMock = mock.method(EmployerProfile, "findOneAndUpdate", async ({ userId }, pipeline) =>
    userId === EMPLOYER_USER ? applyRatingPipeline(employerProfile, pipeline) : null
  );
  t.after(() => {
    jobFindByIdMock.mock.restore();
    employerFindByIdMock.mock.restore();
    workerProfileFindOneMock.mock.restore();
    applicationFindOneMock.mock.restore();
    ratingFindOneMock.mock.restore();
    ratingCreateMock.mock.restore();
    employerProfileFindOneMock.mock.restore();
    workerProfileUpdateMock.mock.restore();
    employerProfileUpdateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER_A },
    body: { jobId: JOB_ID, toUserId: EMPLOYER_USER, score: 5 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(employerProfile.ratingCount, 1, "employer's profile must be updated");
  assert.strictEqual(employerProfile.ratingAvg, 5);
});

// --- 4/13. Employer attempts to rate a non-accepted/unrelated worker ---------

test("submitRating: employer cannot rate worker C, who exists but has no accepted application on this job", async (t) => {
  const { ratingCreateMock } = mockStandardScenario(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_C, score: 3 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

// --- 5. Worker attempts to rate an arbitrary unrelated user ------------------

test("submitRating: accepted worker cannot rate an arbitrary unrelated user instead of the employer", async (t) => {
  const workerProfileA = fakeProfile(WORKER_USER_A, { _id: WORKER_PROFILE_A_ID });
  const jobFindByIdMock = mock.method(Job, "findById", async () => completedJob());
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => fakeProfile(EMPLOYER_USER));
  const workerProfileFindOneMock = mock.method(WorkerProfile, "findOne", async ({ userId }) =>
    userId === WORKER_USER_A ? workerProfileA : null
  );
  const applicationFindOneMock = mock.method(Application, "findOne", async () =>
    acceptedApplication(JOB_ID, workerProfileA)
  );
  const ratingCreateMock = failIfRatingCreateCalled(t);
  t.after(() => {
    jobFindByIdMock.mock.restore();
    employerFindByIdMock.mock.restore();
    workerProfileFindOneMock.mock.restore();
    applicationFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER_A },
    body: { jobId: JOB_ID, toUserId: "SOME_RANDOM_USER", score: 5 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

// --- 6. Worker attempts to rate themselves -----------------------------------

test("submitRating: accepted worker cannot rate themselves", async (t) => {
  const workerProfileA = fakeProfile(WORKER_USER_A, { _id: WORKER_PROFILE_A_ID });
  const jobFindByIdMock = mock.method(Job, "findById", async () => completedJob());
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => fakeProfile(EMPLOYER_USER));
  const workerProfileFindOneMock = mock.method(WorkerProfile, "findOne", async ({ userId }) =>
    userId === WORKER_USER_A ? workerProfileA : null
  );
  const applicationFindOneMock = mock.method(Application, "findOne", async () =>
    acceptedApplication(JOB_ID, workerProfileA)
  );
  const ratingCreateMock = failIfRatingCreateCalled(t);
  t.after(() => {
    jobFindByIdMock.mock.restore();
    employerFindByIdMock.mock.restore();
    workerProfileFindOneMock.mock.restore();
    applicationFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER_A },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 5 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

// --- 7. Accepted worker, but not for THIS job --------------------------------

test("submitRating: a worker accepted on a different job cannot rate this job", async (t) => {
  const workerProfileA = fakeProfile(WORKER_USER_A, { _id: WORKER_PROFILE_A_ID });
  const jobFindByIdMock = mock.method(Job, "findById", async () => completedJob());
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => fakeProfile(EMPLOYER_USER));
  const workerProfileFindOneMock = mock.method(WorkerProfile, "findOne", async ({ userId }) =>
    userId === WORKER_USER_A ? workerProfileA : null
  );
  // No accepted application for THIS job (JOB_ID) - simulates the worker's
  // real accepted application being on a different job entirely.
  const applicationFindOneMock = mock.method(Application, "findOne", async () => null);
  const ratingCreateMock = failIfRatingCreateCalled(t);
  t.after(() => {
    jobFindByIdMock.mock.restore();
    employerFindByIdMock.mock.restore();
    workerProfileFindOneMock.mock.restore();
    applicationFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER_A },
    body: { jobId: JOB_ID, toUserId: EMPLOYER_USER, score: 5 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

// --- 8. Non-completed job (existing behavior preserved) ----------------------

test("submitRating: non-completed job still returns 400, unchanged from before", async (t) => {
  const jobFindByIdMock = mock.method(Job, "findById", async () => completedJob({ status: "open" }));
  const ratingCreateMock = failIfRatingCreateCalled(t);
  t.after(() => jobFindByIdMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 5 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

// --- 9. Duplicate rating (existing behavior preserved) -----------------------

test("submitRating: duplicate rating still returns 409, after authorization succeeds but before create", async (t) => {
  const { ratingCreateMock } = mockStandardScenario(t, { rating: { _id: "EXISTING_RATING" } });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 5 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 409);
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

// --- 10. Missing/nonexistent job (existing behavior preserved) ---------------

test("submitRating: nonexistent job still returns 404, unchanged from before", async (t) => {
  const jobFindByIdMock = mock.method(Job, "findById", async () => null);
  const ratingCreateMock = failIfRatingCreateCalled(t);
  t.after(() => jobFindByIdMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: "NONEXISTENT_JOB", toUserId: WORKER_USER_A, score: 5 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

// --- 12. Employer can also rate accepted worker B (proves the multi-target set) --

test("submitRating: employer can also rate accepted worker B (second legitimate target in the same set)", async (t) => {
  const { workerProfileB } = mockStandardScenario(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_B, score: 3 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(workerProfileB.ratingCount, 1);
});

// =============================================================================
// H-2: duplicate-rating race handling
// =============================================================================

// Shape of a real MongoDB duplicate-key error - code 11000 is the specific
// signal for a unique-index violation, distinct from any other DB failure.
function duplicateKeyError() {
  const error = new Error(
    "E11000 duplicate key error collection: test.ratings index: jobId_1_fromUserId_1_toUserId_1 dup key"
  );
  error.code = 11000;
  error.keyPattern = { jobId: 1, fromUserId: 1, toUserId: 1 };
  return error;
}

/**
 * The aggregate is no longer a save() on a read document - "did not mutate
 * the profile" now means the atomic update was never issued.
 */
function spyOnAggregateUpdate(scenario) {
  return () => scenario.workerProfileUpdateMock.mock.callCount() + scenario.employerProfileUpdateMock.mock.callCount();
}

test("H-2: concurrent duplicate - pre-check sees nothing, Rating.create() hits E11000 -> 409, and the losing request does NOT mutate the profile", async (t) => {
  const scenario = mockStandardScenario(t, {
    // Simulates the race: the winning concurrent request hasn't committed
    // yet when this one's pre-check runs, so it sees no existing rating.
    rating: null,
    ratingCreateImpl: async () => {
      throw duplicateKeyError();
    },
  });
  const { workerProfileA, ratingCreateMock } = scenario;
  const getAggregateUpdates = spyOnAggregateUpdate(scenario);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 4 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error, "the losing request must receive a handled error");
  assert.strictEqual(error.statusCode, 409, "must be the conflict convention, not an unhandled 500");
  assert.strictEqual(ratingCreateMock.mock.callCount(), 1, "create was attempted and lost at the DB level");
  assert.strictEqual(getAggregateUpdates(), 0, "the losing request must never issue the aggregate update");
  assert.strictEqual(workerProfileA.ratingCount, 0, "ratingCount must not be incremented by the losing request");
  assert.strictEqual(workerProfileA.ratingAvg, 0, "ratingAvg must not be changed by the losing request");
});

test("H-2: a non-duplicate DB error from Rating.create() is NOT converted to 409, propagates unchanged, and does not mutate the profile", async (t) => {
  const unrelatedError = new Error("connection reset");
  unrelatedError.name = "MongoNetworkError";
  const scenario = mockStandardScenario(t, {
    ratingCreateImpl: async () => {
      throw unrelatedError;
    },
  });
  const { workerProfileA } = scenario;
  const getAggregateUpdates = spyOnAggregateUpdate(scenario);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 4 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, unrelatedError, "the original error must propagate by reference, unchanged");
  assert.notStrictEqual(error.statusCode, 409);
  assert.strictEqual(getAggregateUpdates(), 0);
  assert.strictEqual(workerProfileA.ratingCount, 0);
});

test("H-2: authorization ordering - an unauthorized user gets the C-2 403, never a duplicate 409, even when a matching rating exists", async (t) => {
  const jobFindByIdMock = mock.method(Job, "findById", async () => completedJob());
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => fakeProfile(EMPLOYER_USER));
  const workerProfileFindOneMock = mock.method(WorkerProfile, "findOne", async () => null);
  // If the duplicate check were (wrongly) reached, this would produce a 409
  // and leak that a rating for this pair already exists.
  const ratingFindOneMock = mock.method(Rating, "findOne", async () => ({ _id: "EXISTING_RATING" }));
  const ratingCreateMock = failIfRatingCreateCalled(t);
  t.after(() => {
    jobFindByIdMock.mock.restore();
    employerFindByIdMock.mock.restore();
    workerProfileFindOneMock.mock.restore();
    ratingFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: UNRELATED_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 1 },
  });

  submitRating(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403, "authorization must fail first");
  assert.strictEqual(ratingFindOneMock.mock.callCount(), 0, "the duplicate check must never be reached");
  assert.strictEqual(ratingCreateMock.mock.callCount(), 0);
});

test("H-2: an existing rating for accepted worker A does not block a legitimate rating of accepted worker B", async (t) => {
  const { workerProfileA, workerProfileB } = mockStandardScenario(t, {
    // A rating from the employer to A already exists; none exists for B.
    ratingFindOneImpl: async ({ toUserId }) => (toUserId === WORKER_USER_A ? { _id: "EXISTING_FOR_A" } : null),
  });

  const first = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_A, score: 5 },
  });
  submitRating(first.req, first.res, first.next);
  const firstResult = await first.done;

  assert.strictEqual(firstResult.error.statusCode, 409, "rating A again is a duplicate");
  assert.strictEqual(workerProfileA.ratingCount, 0);

  const second = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER_B, score: 3 },
  });
  submitRating(second.req, second.res, second.next);
  const secondResult = await second.done;

  assert.strictEqual(secondResult.error, null, "rating B must still succeed independently");
  assert.strictEqual(second.res.statusCode, 201);
  assert.strictEqual(workerProfileB.ratingCount, 1);
  assert.strictEqual(workerProfileB.ratingAvg, 3);
});
