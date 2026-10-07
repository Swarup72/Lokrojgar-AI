/**
 * Employer-initiated job requests: authorization, lifecycle and IDOR.
 *
 * A request is an Application with status "invited" and
 * initiatedBy "employer" - the same document a worker's application would be.
 * These tests pin the properties that make that safe:
 *
 *   - the employer comes from the JWT and the job must be theirs;
 *   - a duplicate request is a 409, never a 500 (the retired /offers path
 *     returned 500 from an unhandled E11000);
 *   - only the invited WORKER may answer, and another worker gets 404 rather
 *     than a 403 that would confirm the request exists;
 *   - the employer cannot accept their own invitation on the worker's behalf;
 *   - the match score is the AI service's, not an invented constant (the
 *     retired path hardcoded 100).
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import Job from "../src/models/job.model.js";
import Application from "../src/models/application.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import Notification from "../src/models/notification.model.js";
import DeviceToken from "../src/models/deviceToken.model.js";
import {
  inviteWorker,
  respondToInvitation,
  acceptOrRejectApplication,
} from "../src/controllers/application.controller.js";

const JOB_ID = "507f1f77bcf86cd799440001";
const EMPLOYER_PROFILE_ID = "507f1f77bcf86cd799440002";
const EMPLOYER_USER = "507f1f77bcf86cd799440003";
const WORKER_PROFILE_ID = "507f1f77bcf86cd799440004";
const WORKER_USER = "507f1f77bcf86cd799440005";
const OTHER_WORKER_PROFILE_ID = "507f1f77bcf86cd799440006";
const OTHER_WORKER_USER = "507f1f77bcf86cd799440007";
const APPLICATION_ID = "507f1f77bcf86cd799440008";

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
  return { req, res, next: (err) => settle({ error: err || null }), done };
}


/**
 * Notifications are a side effect of these flows, not their subject.
 * sendNotificationService deliberately swallows its own failures, but without
 * these mocks it first waits out Mongoose's 10-second buffering timeout against
 * an unconnected model - so every notifying test paid 10s. (The notification
 * CONTRACT is covered in tests/notificationTypes.test.js.)
 */
function stubNotifications(t) {
  const mocks = [
    mock.method(Notification, "create", async (doc) => doc),
    mock.method(DeviceToken, "find", async () => []),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
}

const openJob = (overrides = {}) => ({
  _id: JOB_ID,
  employerId: EMPLOYER_PROFILE_ID,
  status: "open",
  requiredWorkers: 2,
  filledWorkers: 0,
  title: { en: "Electrician needed" },
  payAmount: 800,
  payType: "daily",
  ...overrides,
});

/** The AI scoring call every invite makes, answered without a network request. */
function mockScoring(t, score = 68) {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      worker_id: WORKER_PROFILE_ID,
      job_id: JOB_ID,
      ranking: {
        overall_score: score,
        match_factors: { skill: 70, location: 60, availability: 100, pay: null, rating: null, relevance: 50 },
      },
      explanation: {},
    }),
  });
  t.after(() => {
    global.fetch = originalFetch;
  });
}

function mockInviteScenario(t, { job = openJob(), existingApplication = null, createImpl = null } = {}) {
  mockScoring(t);
  stubNotifications(t);
  const created = [];
  const mocks = [
    mock.method(EmployerProfile, "findOne", async ({ userId }) =>
      String(userId) === EMPLOYER_USER ? { _id: EMPLOYER_PROFILE_ID, userId: EMPLOYER_USER } : null
    ),
    // Ownership is expressed as a FILTER, so a job belonging to someone else is
    // simply not found - the mock answers only the filter it is given.
    mock.method(Job, "findOne", async (filter) =>
      String(filter.employerId) === EMPLOYER_PROFILE_ID && String(filter._id) === JOB_ID ? job : null
    ),
    mock.method(WorkerProfile, "findById", async (workerId) =>
      String(workerId) === WORKER_PROFILE_ID ? { _id: WORKER_PROFILE_ID, userId: WORKER_USER } : null
    ),
    mock.method(WorkerSkill, "find", async () => []),
    mock.method(Application, "findOne", async () => existingApplication),
    mock.method(
      Application,
      "create",
      createImpl ||
        (async (doc) => {
          created.push(doc);
          return { _id: APPLICATION_ID, ...doc };
        })
    ),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
  return { created };
}

// --- invite: the happy path and what it stores ------------------------------

test("inviteWorker creates an invited, employer-initiated application with a REAL match score", async (t) => {
  const { created } = mockInviteScenario(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].status, "invited");
  assert.strictEqual(created[0].initiatedBy, "employer");
  assert.strictEqual(created[0].workerId, WORKER_PROFILE_ID);
  assert.strictEqual(created[0].matchScore, 68, "the score must come from the AI service, not a constant");
  assert.ok(created[0].matchFactors, "match factors must be stored like any other application");
});

test("inviteWorker stores an employer's proposedPay when one is offered", async (t) => {
  const { created } = mockInviteScenario(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID, proposedPay: 950 },
  });
  inviteWorker(req, res, next);
  await done;

  assert.strictEqual(created[0].proposedPay, 950);
});

// --- invite: authorization --------------------------------------------------

test("inviteWorker: an employer cannot send a request for someone else's job", async (t) => {
  mockInviteScenario(t);

  const { req, res, next, done } = fakeReqRes({
    // A different employer user: EmployerProfile.findOne returns null for them,
    // so no profile, no job, no request.
    user: { _id: OTHER_WORKER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
});

test("inviteWorker: an unknown worker id is rejected and nothing is created", async (t) => {
  const { created } = mockInviteScenario(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: "507f1f77bcf86cd7994400ff" },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(created.length, 0);
});

test("inviteWorker: a malformed worker id is a 400, never a 500", async (t) => {
  mockInviteScenario(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: "not-an-object-id" },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

test("inviteWorker: a dual-role account cannot send itself a job request", async (t) => {
  mockScoring(t);
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: EMPLOYER_PROFILE_ID, userId: EMPLOYER_USER })),
    mock.method(Job, "findOne", async () => openJob()),
    // The worker profile belongs to the SAME user as the employer profile.
    mock.method(WorkerProfile, "findById", async () => ({ _id: WORKER_PROFILE_ID, userId: EMPLOYER_USER })),
    mock.method(Application, "create", async () => {
      throw new Error("must not create a self-request");
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /yourself/i);
});

// --- invite: job eligibility ------------------------------------------------

for (const status of ["draft", "assigned", "completed", "cancelled", "expired"]) {
  test(`inviteWorker: no requests may be sent for a job that is ${status}`, async (t) => {
    const { created } = mockInviteScenario(t, { job: openJob({ status }) });

    const { req, res, next, done } = fakeReqRes({
      user: { _id: EMPLOYER_USER },
      body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
    });
    inviteWorker(req, res, next);
    const { error } = await done;

    assert.ok(error, `status "${status}" must be rejected`);
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(created.length, 0);
  });
}

test("inviteWorker: a job already at capacity cannot receive more requests", async (t) => {
  const { created } = mockInviteScenario(t, {
    job: openJob({ requiredWorkers: 2, filledWorkers: 2, status: "partially_assigned" }),
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /capacity/i);
  assert.strictEqual(created.length, 0);
});

test("inviteWorker: a partially_assigned job with room CAN still receive requests", async (t) => {
  const { created } = mockInviteScenario(t, {
    job: openJob({ requiredWorkers: 3, filledWorkers: 1, status: "partially_assigned" }),
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(created.length, 1);
});

// --- invite: duplicates -----------------------------------------------------

test("inviteWorker: a live application for this pair blocks a request with 409", async (t) => {
  const { created } = mockInviteScenario(t, {
    existingApplication: { _id: APPLICATION_ID, status: "applied" },
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 409);
  assert.strictEqual(created.length, 0);
});

test("inviteWorker: a CONCURRENT duplicate (E11000) is a 409, not a 500", async (t) => {
  // The pre-check sees nothing - the competing request has not committed yet -
  // so the unique index is what rejects this one.
  const duplicate = Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
  mockInviteScenario(t, {
    existingApplication: null,
    createImpl: async () => {
      throw duplicate;
    },
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 409, "the retired /offers path returned 500 here");
});

test("inviteWorker: a non-duplicate database error is NOT converted to 409", async (t) => {
  const networkError = Object.assign(new Error("connection reset"), { name: "MongoNetworkError" });
  mockInviteScenario(t, {
    createImpl: async () => {
      throw networkError;
    },
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, networkError, "the original error must propagate unchanged");
});

// --- respond: ownership and IDOR -------------------------------------------

function mockRespondScenario(t, { application, workerUser = WORKER_USER } = {}) {
  stubNotifications(t);
  const mocks = [
    mock.method(WorkerProfile, "findOne", async ({ userId }) => {
      if (String(userId) === WORKER_USER) return { _id: WORKER_PROFILE_ID, userId: WORKER_USER };
      if (String(userId) === OTHER_WORKER_USER)
        return { _id: OTHER_WORKER_PROFILE_ID, userId: OTHER_WORKER_USER };
      return null;
    }),
    mock.method(Application, "findById", () => ({ populate: async () => application })),
    mock.method(EmployerProfile, "findById", async () => ({ _id: EMPLOYER_PROFILE_ID, userId: EMPLOYER_USER })),
    mock.method(Application, "findOneAndUpdate", async (filter, update) => ({
      _id: APPLICATION_ID,
      ...filter,
      ...(update.$set || {}),
    })),
    mock.method(Application, "updateOne", async () => ({ modifiedCount: 1 })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
  return { workerUser };
}

const invitation = (overrides = {}) => ({
  _id: APPLICATION_ID,
  workerId: WORKER_PROFILE_ID,
  jobId: openJob(),
  status: "invited",
  initiatedBy: "employer",
  ...overrides,
});

test("respondToInvitation: ANOTHER worker cannot answer a request addressed to someone else", async (t) => {
  mockRespondScenario(t, { application: invitation() });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: OTHER_WORKER_USER },
    params: { applicationId: APPLICATION_ID },
    body: { response: "accepted" },
  });
  respondToInvitation(req, res, next);
  const { error } = await done;

  assert.ok(error, "an unrelated worker must be rejected");
  assert.strictEqual(
    error.statusCode,
    404,
    "404, not 403 - the existence of someone else's request is not theirs to learn"
  );
});

test("respondToInvitation: the worker cannot answer their OWN application as if it were a request", async (t) => {
  mockRespondScenario(t, {
    application: invitation({ initiatedBy: "worker", status: "applied" }),
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { applicationId: APPLICATION_ID },
    body: { response: "accepted" },
  });
  respondToInvitation(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

for (const status of ["accepted", "declined", "rejected", "withdrawn", "completed"]) {
  test(`respondToInvitation: a request already ${status} cannot be answered again`, async (t) => {
    mockRespondScenario(t, { application: invitation({ status }) });

    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      params: { applicationId: APPLICATION_ID },
      body: { response: "accepted" },
    });
    respondToInvitation(req, res, next);
    const { error } = await done;

    assert.ok(error, `status "${status}" must not be answerable`);
    assert.strictEqual(error.statusCode, 400);
  });
}

test("respondToInvitation: declining sets declined, records respondedAt, and claims no slot", async (t) => {
  mockRespondScenario(t, { application: invitation() });
  // reserveWorkerSlot works through Job.findOneAndUpdate; it must never be
  // reached by a decline.
  const jobUpdateMock = mock.method(Job, "findOneAndUpdate", async () => {
    throw new Error("a decline must not touch job capacity");
  });
  t.after(() => jobUpdateMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { applicationId: APPLICATION_ID },
    body: { response: "declined" },
  });
  respondToInvitation(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.status, "declined");
  assert.ok(res.body.data.respondedAt instanceof Date);
  assert.strictEqual(jobUpdateMock.mock.callCount(), 0);
});

test("respondToInvitation: accepting RESERVES a slot before transitioning", async (t) => {
  // findById is called twice: once to load the invitation, then again at the end
  // to return the accepted document. The same mock has to serve both.
  stubNotifications(t);
  let loads = 0;
  const findByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => {
      loads += 1;
      return loads === 1 ? invitation() : { _id: APPLICATION_ID, status: "accepted" };
    },
  }));
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({
    _id: WORKER_PROFILE_ID,
    userId: WORKER_USER,
  }));
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => ({
    _id: EMPLOYER_PROFILE_ID,
    userId: EMPLOYER_USER,
  }));
  const appUpdateOneMock = mock.method(Application, "updateOne", async () => ({ modifiedCount: 1 }));
  const appFindOneAndUpdateMock = mock.method(Application, "findOneAndUpdate", async () => ({
    _id: APPLICATION_ID,
    status: "accepted",
  }));
  // The reservation is the capacity guarantee - this proves the request path
  // goes through it rather than incrementing a counter directly.
  const reserveMock = mock.method(Job, "findOneAndUpdate", async (filter) => {
    assert.ok(filter.$expr, "capacity must be tested inside the filter, by MongoDB");
    return { ...openJob(), filledWorkers: 1, status: "partially_assigned" };
  });
  t.after(() => {
    reserveMock.mock.restore();
    findByIdMock.mock.restore();
    workerFindOneMock.mock.restore();
    employerFindByIdMock.mock.restore();
    appUpdateOneMock.mock.restore();
    appFindOneAndUpdateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { applicationId: APPLICATION_ID },
    body: { response: "accepted" },
  });
  respondToInvitation(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(reserveMock.mock.callCount(), 1, "exactly one reservation attempt");
});

test("respondToInvitation: a job that filled up first is refused, not over-hired", async (t) => {
  mockRespondScenario(t, { application: invitation() });
  // reserveWorkerSlot matched nothing: the job is full.
  const reserveMock = mock.method(Job, "findOneAndUpdate", async () => null);
  t.after(() => reserveMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { applicationId: APPLICATION_ID },
    body: { response: "accepted" },
  });
  respondToInvitation(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /capacity/i);
});

// --- the employer must not answer their own invitation ----------------------

test("acceptOrRejectApplication: an employer cannot accept the invitation THEY sent", async (t) => {
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: EMPLOYER_PROFILE_ID, userId: EMPLOYER_USER })),
    mock.method(Application, "findById", () => ({
      populate: async () => ({
        _id: APPLICATION_ID,
        status: "invited",
        initiatedBy: "employer",
        jobId: openJob(),
        workerId: { _id: WORKER_PROFILE_ID, userId: WORKER_USER },
      }),
    })),
    mock.method(Job, "findOneAndUpdate", async () => {
      throw new Error("no slot may be reserved for an unanswered invitation");
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER },
    params: { applicationId: APPLICATION_ID },
    body: { status: "accepted" },
  });
  acceptOrRejectApplication(req, res, next);
  const { error } = await done;

  assert.ok(error, "hiring on the worker's behalf must be refused");
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /worker has to accept/i);
});
