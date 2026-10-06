import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

process.env.AI_SERVICE_URL = "http://test-ai:9000";

import Application from "../src/models/application.model.js";
import Job from "../src/models/job.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import Notification from "../src/models/notification.model.js";
import DeviceToken from "../src/models/deviceToken.model.js";
import { applyForJob, acceptOrRejectApplication } from "../src/controllers/application.controller.js";

// Same fakeReqRes/mockFetchOnce conventions already used in
// voiceProfile.controller.test.js - scoreWorkerJobPair (aiService.client.js)
// is a plain ESM function export and can't be mocked via mock.method
// directly, so its underlying fetch() call is mocked instead.
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

function mockFetchOnce(handler) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = originalFetch;
  };
}

function fakeScoringResponse() {
  return {
    ok: true,
    json: async () => ({
      worker_id: "WORKER_PROFILE_001",
      job_id: "JOB001",
      ranking: {
        overall_score: 75,
        match_factors: { skill: 80, location: 70, availability: 100, pay: null, rating: null, relevance: 50 },
      },
      explanation: {},
    }),
  };
}

function fakeWorkerProfile(overrides = {}) {
  return { _id: "WORKER_PROFILE_001", userId: "USER001", fullName: "Test Worker", ...overrides };
}

function openJob(overrides = {}) {
  return { _id: "JOB001", status: "open", employerId: "EMPPROFILE001", title: { en: "Test Job" }, ...overrides };
}

// A shape matching a real MongoDB/Mongoose duplicate-key error - code 11000
// is the specific, documented signal for this condition, distinct from
// ValidationError/CastError/any other database failure.
function duplicateKeyError() {
  const error = new Error(
    "E11000 duplicate key error collection: test.applications index: jobId_1_workerId_1 dup key: { jobId: \"JOB001\", workerId: \"WORKER_PROFILE_001\" }"
  );
  error.code = 11000;
  error.keyPattern = { jobId: 1, workerId: 1 };
  return error;
}

// --- 1. Sequential duplicate (existing pre-check path) -----------------------

test("applyForJob: first application succeeds", async (t) => {
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => fakeWorkerProfile());
  const jobFindByIdMock = mock.method(Job, "findById", async () => openJob());
  const workerSkillFindMock = mock.method(WorkerSkill, "find", async () => []);
  const appFindOneMock = mock.method(Application, "findOne", async () => null);
  const appCreateMock = mock.method(Application, "create", async (doc) => ({ _id: "APP001", ...doc }));
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => null);
  const restoreFetch = mockFetchOnce(async () => fakeScoringResponse());
  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    appFindOneMock.mock.restore();
    appCreateMock.mock.restore();
    employerFindByIdMock.mock.restore();
    restoreFetch();
  });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "USER001" }, body: { jobId: "JOB001" } });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(appCreateMock.mock.callCount(), 1);
});

test("applyForJob: sequential duplicate (pre-check finds an existing application) is rejected with 409, no create attempted", async (t) => {
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => fakeWorkerProfile());
  const jobFindByIdMock = mock.method(Job, "findById", async () => openJob());
  const appFindOneMock = mock.method(Application, "findOne", async () => ({
    _id: "APP001",
    status: "applied",
  }));
  const appCreateMock = mock.method(Application, "create", async () => {
    throw new Error("Application.create must NOT be called when the pre-check already found a duplicate");
  });
  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    appFindOneMock.mock.restore();
    appCreateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "USER001" }, body: { jobId: "JOB001" } });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 409);
  assert.strictEqual(appCreateMock.mock.callCount(), 0);
});

// --- 2. Concurrent duplicate / E11000 path (deterministic, no real race) ----

test("applyForJob: pre-check passes (no existing application seen) but Application.create() hits a real duplicate-key error -> 409, not a generic 500", async (t) => {
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => fakeWorkerProfile());
  const jobFindByIdMock = mock.method(Job, "findById", async () => openJob());
  const workerSkillFindMock = mock.method(WorkerSkill, "find", async () => []);
  // Simulates the race: the pre-check runs before the winning concurrent
  // request has committed its insert, so it sees nothing.
  const appFindOneMock = mock.method(Application, "findOne", async () => null);
  const appCreateMock = mock.method(Application, "create", async () => {
    throw duplicateKeyError();
  });
  const restoreFetch = mockFetchOnce(async () => fakeScoringResponse());
  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    workerSkillFindMock.mock.restore();
    appFindOneMock.mock.restore();
    appCreateMock.mock.restore();
    restoreFetch();
  });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "USER001" }, body: { jobId: "JOB001" } });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.ok(error, "the losing request must receive a handled error, not silently succeed");
  assert.strictEqual(error.statusCode, 409, "must be the project's conflict convention, not an unhandled 500");
  assert.strictEqual(appCreateMock.mock.callCount(), 1, "create was attempted (and lost the race at the DB level)");
});

// --- 3. Different workers applying to the same job remain independent -------

test("applyForJob: a different worker applying to the same job is unaffected by another worker's application", async (t) => {
  const otherWorkerProfile = fakeWorkerProfile({ _id: "WORKER_PROFILE_002", userId: "USER002" });
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async ({ userId }) =>
    userId === "USER002" ? otherWorkerProfile : fakeWorkerProfile()
  );
  const jobFindByIdMock = mock.method(Job, "findById", async () => openJob());
  const workerSkillFindMock = mock.method(WorkerSkill, "find", async () => []);
  // This worker has no existing application of their own, even though
  // WORKER_PROFILE_001 already applied in a prior test - the check is
  // correctly scoped to {jobId, workerId}, not just jobId.
  const appFindOneMock = mock.method(Application, "findOne", async ({ workerId }) =>
    workerId === "WORKER_PROFILE_002" ? null : { _id: "APP001", status: "applied" }
  );
  const appCreateMock = mock.method(Application, "create", async (doc) => ({ _id: "APP002", ...doc }));
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => null);
  const restoreFetch = mockFetchOnce(async () => fakeScoringResponse());
  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    workerSkillFindMock.mock.restore();
    appFindOneMock.mock.restore();
    appCreateMock.mock.restore();
    employerFindByIdMock.mock.restore();
    restoreFetch();
  });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "USER002" }, body: { jobId: "JOB001" } });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(appCreateMock.mock.callCount(), 1);
  assert.strictEqual(appCreateMock.mock.calls[0].arguments[0].workerId, "WORKER_PROFILE_002");
});

// --- 4. Existing eligibility behavior is preserved ---------------------------

test("applyForJob: existing eligibility behavior (job not open) is unchanged", async (t) => {
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => fakeWorkerProfile());
  const jobFindByIdMock = mock.method(Job, "findById", async () => openJob({ status: "partially_assigned" }));
  const appCreateMock = mock.method(Application, "create", async () => {
    throw new Error("Application.create must NOT be called for an ineligible job");
  });
  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    appCreateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "USER001" }, body: { jobId: "JOB001" } });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(appCreateMock.mock.callCount(), 0);
});

// --- 5. Error specificity: a non-duplicate DB error must NOT become 409 ------

test("applyForJob: a non-duplicate database error from Application.create() is NOT converted into the 409 duplicate response", async (t) => {
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => fakeWorkerProfile());
  const jobFindByIdMock = mock.method(Job, "findById", async () => openJob());
  const workerSkillFindMock = mock.method(WorkerSkill, "find", async () => []);
  const appFindOneMock = mock.method(Application, "findOne", async () => null);
  const unrelatedError = new Error("connection reset");
  unrelatedError.name = "MongoNetworkError";
  const appCreateMock = mock.method(Application, "create", async () => {
    throw unrelatedError;
  });
  const restoreFetch = mockFetchOnce(async () => fakeScoringResponse());
  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    workerSkillFindMock.mock.restore();
    appFindOneMock.mock.restore();
    appCreateMock.mock.restore();
    restoreFetch();
  });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "USER001" }, body: { jobId: "JOB001" } });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.notStrictEqual(error.statusCode, 409, "an unrelated DB error must not be masked as a duplicate conflict");
  assert.strictEqual(error, unrelatedError, "the original error must propagate unchanged");
});

// =============================================================================
// H-3: atomic filledWorkers updates on application acceptance
// =============================================================================

const EMPLOYER_PROFILE_ID = "EMPPROFILE001";

function fakeApplicationDoc(id, workerUserId) {
  return {
    _id: id,
    status: "applied",
    jobId: { _id: "JOB001", employerId: EMPLOYER_PROFILE_ID, title: { en: "Test Job" } },
    workerId: { _id: `WP_${id}`, userId: workerUserId },
    saveCalls: 0,
    save: async function () {
      this.saveCalls += 1;
      return this;
    },
  };
}

/**
 * Mocks everything acceptOrRejectApplication touches. Application
 * findOneAndUpdate is modeled against an in-memory status store so it
 * behaves like the real conditional filter {_id, status: {$ne:"accepted"}}:
 * it matches (and flips the status) only while the stored status is not
 * already "accepted". Job.findById is set to throw, proving the old
 * read-then-save path for the counter is never used.
 */
function mockAcceptScenario(t, { applications, employerProfileId = EMPLOYER_PROFILE_ID, requiredWorkers = 5 }) {
  const storedStatus = new Map(applications.map((a) => [a._id, a.status]));

  const employerFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: employerProfileId }));
  const appFindByIdMock = mock.method(Application, "findById", (id) => ({
    populate: async () => applications.find((a) => a._id === id) || null,
  }));
  const appTransitionMock = mock.method(Application, "findOneAndUpdate", async (filter) => {
    const current = storedStatus.get(filter._id);
    if (current === undefined || current === filter.status.$ne) return null;
    storedStatus.set(filter._id, "accepted");
    return { _id: filter._id, status: "accepted" };
  });
  // Capacity now lives in the update FILTER (reserveWorkerSlot /
  // releaseWorkerSlot), so this stand-in models a real job document:
  // a reservation only succeeds while filledWorkers < requiredWorkers.
  const jobState = { _id: "JOB001", filledWorkers: 0, requiredWorkers, title: { en: "Test Job" } };
  const jobUpdateMock = mock.method(Job, "findOneAndUpdate", async (filter) => {
    const isRelease = Boolean(filter.status && filter.status.$in);
    if (isRelease) {
      if (jobState.filledWorkers <= 0) return null;
      jobState.filledWorkers -= 1;
      return { ...jobState };
    }
    if (jobState.filledWorkers >= jobState.requiredWorkers) return null; // full
    jobState.filledWorkers += 1;
    return { ...jobState };
  });
  const jobFindByIdMock = mock.method(Job, "findById", async () => {
    throw new Error("Job.findById (read-then-save counter path) must not be used on acceptance");
  });
  const notificationCreateMock = mock.method(Notification, "create", async (doc) => ({ _id: "NOTIF", ...doc }));
  const deviceTokenFindMock = mock.method(DeviceToken, "find", async () => []);

  t.after(() => {
    employerFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
    appTransitionMock.mock.restore();
    jobUpdateMock.mock.restore();
    jobFindByIdMock.mock.restore();
    notificationCreateMock.mock.restore();
    deviceTokenFindMock.mock.restore();
  });

  return { storedStatus, appTransitionMock, jobUpdateMock, jobFindByIdMock, notificationCreateMock, jobState };
}

async function callAccept(applicationId, status = "accepted") {
  const { req, res, next, done } = fakeReqRes({ user: { _id: "EMPLOYER_USER" }, body: { status } });
  req.params = { applicationId };
  acceptOrRejectApplication(req, res, next);
  const { error } = await done;
  return { error, res };
}

test("H-3: normal acceptance - application becomes accepted, counter incremented exactly once, notification still sent", async (t) => {
  const appA = fakeApplicationDoc("APP_A", "WORKER_USER_A");
  const { storedStatus, jobState, notificationCreateMock } = mockAcceptScenario(t, { applications: [appA] });

  const { error, res } = await callAccept("APP_A");

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.status, "accepted");
  assert.strictEqual(storedStatus.get("APP_A"), "accepted");
  assert.strictEqual(jobState.filledWorkers, 1, "exactly one slot consumed");
  assert.strictEqual(notificationCreateMock.mock.callCount(), 1);
  // "APPLICATION_ACCEPTED" here was the invalid value the controller used to
  // send; it is not in the Notification schema enum, so the notification was
  // never actually persisted. The templateKey is still APPLICATION_ACCEPTED -
  // only the schema `type` changed. See tests/notificationTypes.test.js.
  assert.strictEqual(notificationCreateMock.mock.calls[0].arguments[0].type, "application_update");
});

test("H-3: two independent applications for the same job each increment the counter once (2 total)", async (t) => {
  const appA = fakeApplicationDoc("APP_A", "WORKER_USER_A");
  const appB = fakeApplicationDoc("APP_B", "WORKER_USER_B");
  const { storedStatus, jobState } = mockAcceptScenario(t, { applications: [appA, appB] });

  const [resultA, resultB] = await Promise.all([callAccept("APP_A"), callAccept("APP_B")]);

  assert.strictEqual(resultA.error, null);
  assert.strictEqual(resultB.error, null);
  assert.strictEqual(storedStatus.get("APP_A"), "accepted");
  assert.strictEqual(storedStatus.get("APP_B"), "accepted");
  assert.strictEqual(jobState.filledWorkers, 2, "two distinct applications consume two slots");
});

test("H-3: the counter update is a single atomic pipeline update, and the status transition is conditional", async (t) => {
  const appA = fakeApplicationDoc("APP_A", "WORKER_USER_A");
  const { appTransitionMock, jobUpdateMock, jobFindByIdMock } = mockAcceptScenario(t, { applications: [appA] });

  await callAccept("APP_A");

  // Application transition is guarded so only one request can flip it.
  const [transitionFilter, transitionUpdate] = appTransitionMock.mock.calls[0].arguments;
  assert.deepStrictEqual(transitionFilter, { _id: "APP_A", status: { $ne: "accepted" } });
  assert.deepStrictEqual(transitionUpdate, { $set: { status: "accepted" } });

  // Counter: one conditional findOneAndUpdate whose pipeline increments by
  // exactly 1 and derives status from the NEW count, in the same atomic
  // update. The capacity test must live in the FILTER so MongoDB evaluates
  // it against the live document, not against a previously-read copy.
  const [filter, pipeline, options] = jobUpdateMock.mock.calls[0].arguments;
  assert.strictEqual(filter._id, "JOB001");
  assert.deepStrictEqual(filter.$expr, { $lt: [{ $ifNull: ["$filledWorkers", 0] }, "$requiredWorkers"] });
  assert.ok(Array.isArray(pipeline), "must be an update pipeline, not a JS-computed $set");
  assert.deepStrictEqual(pipeline[0], {
    $set: { filledWorkers: { $add: [{ $ifNull: ["$filledWorkers", 0] }, 1] } },
  });
  assert.deepStrictEqual(pipeline[1], {
    $set: {
      status: { $cond: [{ $gte: ["$filledWorkers", "$requiredWorkers"] }, "assigned", "partially_assigned"] },
    },
  });
  assert.strictEqual(options.updatePipeline, true);
  assert.strictEqual(jobFindByIdMock.mock.callCount(), 0, "no read-then-save of the job document");
});

test("H-3: accepting the same application twice (and concurrently) increments the counter only once", async (t) => {
  const appA = fakeApplicationDoc("APP_A", "WORKER_USER_A");
  const { jobState } = mockAcceptScenario(t, { applications: [appA] });

  const results = await Promise.all([callAccept("APP_A"), callAccept("APP_A"), callAccept("APP_A")]);

  // Existing response behavior preserved: every call still answers 200 accepted.
  for (const { error, res } of results) {
    assert.strictEqual(error, null);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.status, "accepted");
  }
  // A reservation taken by a request that then lost the application
  // transition is handed back, so the NET effect is exactly one slot.
  assert.strictEqual(jobState.filledWorkers, 1, "only one slot may be consumed in total");
});

test("H-3: authorization unchanged - an employer who does not own the job gets 403 and nothing is written", async (t) => {
  const appA = fakeApplicationDoc("APP_A", "WORKER_USER_A");
  const { appTransitionMock, jobUpdateMock, storedStatus } = mockAcceptScenario(t, {
    applications: [appA],
    employerProfileId: "SOME_OTHER_EMPLOYER",
  });

  const { error } = await callAccept("APP_A");

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
  assert.strictEqual(appTransitionMock.mock.callCount(), 0);
  assert.strictEqual(jobUpdateMock.mock.callCount(), 0);
  assert.strictEqual(storedStatus.get("APP_A"), "applied");
});

test("H-3: rejection behavior - saves the status, never touches the counter, sends the rejection notification", async (t) => {
  const appA = fakeApplicationDoc("APP_A", "WORKER_USER_A");
  const { appTransitionMock, jobState, notificationCreateMock } = mockAcceptScenario(t, {
    applications: [appA],
  });

  const { error, res } = await callAccept("APP_A", "rejected");

  assert.strictEqual(error, null);
  assert.strictEqual(res.body.data.status, "rejected");
  // Rejection is now a conditional update guarded on status != accepted, so
  // it can never overwrite a concurrent acceptance (which would strand a
  // filled slot with no accepted application).
  assert.strictEqual(appTransitionMock.mock.callCount(), 1);
  const [rejectFilter, rejectUpdate] = appTransitionMock.mock.calls[0].arguments;
  assert.deepStrictEqual(rejectFilter, { _id: "APP_A", status: { $ne: "accepted" } });
  assert.deepStrictEqual(rejectUpdate, { $set: { status: "rejected" } });
  assert.strictEqual(jobState.filledWorkers, 0, "rejection never consumes capacity");
  assert.strictEqual(notificationCreateMock.mock.callCount(), 1);
  assert.strictEqual(notificationCreateMock.mock.calls[0].arguments[0].type, "application_update");
});
