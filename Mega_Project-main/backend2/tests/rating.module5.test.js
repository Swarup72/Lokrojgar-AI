/**
 * MODULE 5 (Reviews & Ratings) regression tests.
 *
 * These cover the three defects found by a live probe against a running
 * server and an isolated database, each of which the pre-existing
 * rating.controller.test.js suite passed straight through:
 *
 *   1. A rateable job became UNRATEABLE by both parties once the
 *      application was marked completed - PATCH /applications/:id/complete
 *      moves the application from "accepted" to "completed", and the
 *      authorization query only matched "accepted". Measured: HTTP 403 for
 *      the employer AND the worker, after doing exactly the right thing.
 *   2. A fractional score (3.7) was accepted and persisted - the model's
 *      min/max never constrained it to whole stars. Measured: HTTP 201.
 *   3. Four legitimate concurrent ratings for the same worker created 4
 *      Rating documents but left ratingCount=3 / ratingAvg=3.67 instead of
 *      4 / 3.50 - the classic read -> modify in JS -> save() lost update.
 *
 * The averaging MATH is verified against a real MongoDB in
 * tests/integration/ratingAggregate.integration.test.js, because only
 * MongoDB can prove it evaluates the $set pipeline the way the controller
 * assumes. Here we prove the controller SENDS that pipeline (one stage, both
 * fields, derived from the stored values) and never falls back to a
 * JS-computed average.
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import Job from "../src/models/job.model.js";
import Application from "../src/models/application.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import Rating from "../src/models/rating.model.js";
import { submitRating } from "../src/controllers/rating.controller.js";
import { validate } from "../src/middlewares/validate.middleware.js";
import { submitRatingValidator, MAX_REVIEW_LENGTH } from "../src/validators/rating.validator.js";

const JOB_ID = "JOB_M5";
const EMPLOYER_PROFILE_ID = "EMP_PROFILE_M5";
const EMPLOYER_USER = "EMPLOYER_USER_M5";
const WORKER_PROFILE_ID = "WORKER_PROFILE_M5";
const WORKER_USER = "WORKER_USER_M5";

function fakeReqRes({ user, body = {}, params = {} } = {}) {
  const req = { user, body, params };
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
  const next = (err) => settle({ error: err || null });
  return { req, res, next, done };
}

// =============================================================================
// DEFECT 1: completing the work must not make the job unrateable
// =============================================================================

/**
 * Mocks a completed job whose single application sits in `applicationStatus`.
 * Nothing here filters by status itself - the mocks faithfully answer only
 * the filter the CONTROLLER sends, so a controller that asks for
 * {status: "accepted"} genuinely finds nothing when the application is
 * "completed", exactly as MongoDB would.
 */
function mockJobWithApplicationStatus(t, applicationStatus) {
  const employerProfile = { _id: EMPLOYER_PROFILE_ID, userId: EMPLOYER_USER, ratingAvg: 0, ratingCount: 0 };
  const workerProfile = { _id: WORKER_PROFILE_ID, userId: WORKER_USER, ratingAvg: 0, ratingCount: 0 };
  const application = {
    jobId: JOB_ID,
    workerId: { ...workerProfile },
    status: applicationStatus,
  };

  const matchesStatus = (filter) => {
    if (!filter || filter.status === undefined) return true;
    if (typeof filter.status === "string") return filter.status === applicationStatus;
    if (Array.isArray(filter.status.$in)) return filter.status.$in.includes(applicationStatus);
    return false;
  };

  const mocks = [
    mock.method(Job, "findById", async () => ({
      _id: JOB_ID,
      status: "completed",
      employerId: EMPLOYER_PROFILE_ID,
    })),
    mock.method(EmployerProfile, "findById", async () => employerProfile),
    mock.method(WorkerProfile, "findOne", async ({ userId }) => (userId === WORKER_USER ? workerProfile : null)),
    mock.method(EmployerProfile, "findOne", async ({ userId }) =>
      userId === EMPLOYER_USER ? employerProfile : null
    ),
    mock.method(Application, "find", (filter) => ({
      populate: async () => (matchesStatus(filter) ? [application] : []),
    })),
    mock.method(Application, "findOne", async (filter) => (matchesStatus(filter) ? application : null)),
    mock.method(Rating, "findOne", async () => null),
    mock.method(Rating, "create", async (doc) => ({ _id: "RATING_M5", ...doc })),
    mock.method(WorkerProfile, "findOneAndUpdate", async ({ userId }) =>
      userId === WORKER_USER ? workerProfile : null
    ),
    mock.method(EmployerProfile, "findOneAndUpdate", async ({ userId }) =>
      userId === EMPLOYER_USER ? employerProfile : null
    ),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
  return { employerProfile, workerProfile };
}

for (const applicationStatus of ["accepted", "completed"]) {
  test(`M5: employer can rate the worker when the application is "${applicationStatus}"`, async (t) => {
    mockJobWithApplicationStatus(t, applicationStatus);

    const { req, res, next, done } = fakeReqRes({
      user: { _id: EMPLOYER_USER },
      body: { jobId: JOB_ID, toUserId: WORKER_USER, score: 4 },
    });

    submitRating(req, res, next);
    const { error } = await done;

    assert.strictEqual(error, null, `employer must not be blocked by a "${applicationStatus}" application`);
    assert.strictEqual(res.statusCode, 201);
  });

  test(`M5: worker can rate the employer when the application is "${applicationStatus}"`, async (t) => {
    mockJobWithApplicationStatus(t, applicationStatus);

    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      body: { jobId: JOB_ID, toUserId: EMPLOYER_USER, score: 5 },
    });

    submitRating(req, res, next);
    const { error } = await done;

    assert.strictEqual(error, null, `worker must not be blocked by a "${applicationStatus}" application`);
    assert.strictEqual(res.statusCode, 201);
  });
}

test('M5: a "withdrawn" application still confers no rating right in either direction', async (t) => {
  mockJobWithApplicationStatus(t, "withdrawn");

  for (const [from, to] of [
    [EMPLOYER_USER, WORKER_USER],
    [WORKER_USER, EMPLOYER_USER],
  ]) {
    const { req, res, next, done } = fakeReqRes({
      user: { _id: from },
      body: { jobId: JOB_ID, toUserId: to, score: 3 },
    });
    submitRating(req, res, next);
    const { error } = await done;
    assert.ok(error, "a withdrawn application must not become rateable");
    assert.strictEqual(error.statusCode, 403);
  }
});

// =============================================================================
// DEFECT 3: the aggregate must be ONE atomic pipeline, never JS-computed
// =============================================================================

test("M5: the profile aggregate is a single-stage update pipeline derived from the stored values", async (t) => {
  const { workerProfile } = mockJobWithApplicationStatus(t, "completed");
  // A profile that already has history - the pipeline must read these from
  // the document ($ifNull/$multiply), not from anything computed in Node.
  workerProfile.ratingAvg = 4;
  workerProfile.ratingCount = 3;

  let capturedPipeline = null;
  let capturedOptions = null;
  const updateMock = mock.method(WorkerProfile, "findOneAndUpdate", async (filter, update, options) => {
    capturedPipeline = update;
    capturedOptions = options;
    return workerProfile;
  });
  t.after(() => updateMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER, score: 2 },
  });
  submitRating(req, res, next);
  const { error } = await done;
  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);

  assert.ok(Array.isArray(capturedPipeline), "the update must be an aggregation pipeline");
  assert.strictEqual(capturedPipeline.length, 1, "ratingAvg and ratingCount must move in ONE atomic stage");
  assert.strictEqual(capturedOptions.updatePipeline, true, "Mongoose 9 needs updatePipeline to send a pipeline");

  const set = capturedPipeline[0].$set;
  assert.deepStrictEqual(
    set.ratingCount,
    { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] },
    "the count must increment server-side from the stored value"
  );

  // The new average must be (storedAvg * storedCount + score) / (storedCount + 1),
  // rounded to 2dp - every operand a field reference except the score.
  const divide = set.ratingAvg.$round[0].$divide;
  assert.strictEqual(set.ratingAvg.$round[1], 2, "stored to 2 decimal places");
  assert.deepStrictEqual(divide[0], {
    $add: [{ $multiply: [{ $ifNull: ["$ratingAvg", 0] }, { $ifNull: ["$ratingCount", 0] }] }, 2],
  });
  assert.deepStrictEqual(divide[1], { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] });

  // The anti-pattern this replaced: (oldAvg + newScore) / 2, computed in JS.
  const serialized = JSON.stringify(capturedPipeline);
  assert.ok(!serialized.includes('"ratingAvg":4'), "no JS-computed average may be sent as a literal");
  assert.ok(!serialized.includes('"ratingCount":4'), "no JS-computed count may be sent as a literal");
});

test("M5: the rating is persisted BEFORE the aggregate, and the aggregate is attempted exactly once", async (t) => {
  mockJobWithApplicationStatus(t, "completed");

  const order = [];
  const createMock = mock.method(Rating, "create", async (doc) => {
    order.push("create");
    return { _id: "RATING_M5", ...doc };
  });
  const workerUpdateMock = mock.method(WorkerProfile, "findOneAndUpdate", async () => {
    order.push("worker-aggregate");
    return { userId: WORKER_USER, ratingAvg: 4, ratingCount: 1 };
  });
  const employerUpdateMock = mock.method(EmployerProfile, "findOneAndUpdate", async () => {
    order.push("employer-aggregate");
    return null;
  });
  t.after(() => {
    createMock.mock.restore();
    workerUpdateMock.mock.restore();
    employerUpdateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER, score: 4 },
  });
  submitRating(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.deepStrictEqual(
    order,
    ["create", "worker-aggregate"],
    "the unique index must decide the duplicate before any aggregate runs, and a matched worker profile must not also update an employer profile"
  );
});

test("M5: a target with neither a worker nor an employer profile still persists the rating", async (t) => {
  mockJobWithApplicationStatus(t, "completed");
  // Defensive: the rating is the record of truth; a missing profile simply
  // has no aggregate to carry, and must not turn a valid rating into a 500.
  const workerUpdateMock = mock.method(WorkerProfile, "findOneAndUpdate", async () => null);
  const employerUpdateMock = mock.method(EmployerProfile, "findOneAndUpdate", async () => null);
  t.after(() => {
    workerUpdateMock.mock.restore();
    employerUpdateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, toUserId: WORKER_USER, score: 4 },
  });
  submitRating(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(employerUpdateMock.mock.callCount(), 1, "the employer direction is the documented fallback");
});

// =============================================================================
// DEFECT 2: score validation, through the REAL route middleware
// =============================================================================

async function runValidator(body) {
  const req = { body, query: {}, params: {} };
  let captured;
  const next = (err) => {
    captured = err || null;
  };
  await validate(submitRatingValidator)(req, {}, next);
  return { error: captured, body: req.body };
}

const VALID = { jobId: JOB_ID, toUserId: WORKER_USER };

test("M5: every whole star 1..5 is accepted", async () => {
  for (const score of [1, 2, 3, 4, 5]) {
    const { error } = await runValidator({ ...VALID, score });
    assert.strictEqual(error, null, `score ${score} must be accepted`);
  }
});

test("M5: fractional, out-of-range, wrong-typed and missing scores are all rejected with 400", async () => {
  const rejected = [
    ["fractional 3.7 - the measured defect", 3.7],
    ["fractional 5.5", 5.5],
    ["below range", 0],
    ["negative", -1],
    ["above range", 6],
    ["huge", 1e9],
    ["numeric string", "4"],
    ["null", null],
    ["boolean", true],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ];
  for (const [label, score] of rejected) {
    const { error } = await runValidator({ ...VALID, score });
    assert.ok(error, `${label} must be rejected`);
    assert.strictEqual(error.statusCode, 400, `${label} must be a 400, not a 500`);
  }

  const { error: missing } = await runValidator({ ...VALID });
  assert.ok(missing, "a missing score must be rejected");
  assert.strictEqual(missing.statusCode, 400);
});

test("M5: jobId and toUserId are required - the client cannot omit the authorization inputs", async () => {
  for (const body of [{ toUserId: WORKER_USER, score: 4 }, { jobId: JOB_ID, score: 4 }, { score: 4 }]) {
    const { error } = await runValidator(body);
    assert.ok(error);
    assert.strictEqual(error.statusCode, 400);
  }
});

test("M5: review text is optional, bounded, and a boundary-length review is still accepted", async () => {
  const { error: omitted } = await runValidator({ ...VALID, score: 4 });
  assert.strictEqual(omitted, null, "review is optional");

  const { error: atLimit } = await runValidator({ ...VALID, score: 4, review: "x".repeat(MAX_REVIEW_LENGTH) });
  assert.strictEqual(atLimit, null, `exactly ${MAX_REVIEW_LENGTH} characters must be accepted`);

  const { error: overLimit } = await runValidator({
    ...VALID,
    score: 4,
    review: "x".repeat(MAX_REVIEW_LENGTH + 1),
  });
  assert.ok(overLimit, "one character over the limit must be rejected");
  assert.strictEqual(overLimit.statusCode, 400);
});

test("M5: the validator cannot be used to smuggle fromUserId or a pre-set aggregate", async () => {
  // Zod strips unknown keys by default, so the controller only ever sees the
  // declared fields - fromUserId always comes from req.user, never the body.
  const { error, body } = await runValidator({
    ...VALID,
    score: 4,
    fromUserId: "ATTACKER",
    ratingAvg: 5,
    ratingCount: 999,
  });
  assert.strictEqual(error, null);
  assert.deepStrictEqual(Object.keys(body).sort(), ["jobId", "score", "toUserId"]);
});
