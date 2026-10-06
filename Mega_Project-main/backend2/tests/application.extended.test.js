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
import {
  applyForJob,
  withdrawApplication,
  getMyApplications,
  getJobApplicants,
  getApplicationById,
  shortlistApplication,
  acceptOrRejectApplication,
  completeApplication,
} from "../src/controllers/application.controller.js";

function fakeReqRes({ user, body = {}, params = {}, query = {} } = {}) {
  const req = { user, body, params, query };
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
        overall_score: 85,
        match_factors: { skill: 90, location: 80, availability: 100, pay: null, rating: null, relevance: 70 },
      },
      explanation: {},
    }),
  };
}

// --- 1. Application Creation Extended Tests ---------------------------------

test("applyForJob: rejects malformed jobId with 400 Bad Request", async () => {
  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { jobId: "" },
  });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

test("applyForJob: rejects application when job is full", async (t) => {
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WORKER001" }));
  const jobFindByIdMock = mock.method(Job, "findById", async () => ({
    _id: "JOB001",
    status: "open",
    requiredWorkers: 2,
    filledWorkers: 2,
  }));
  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { jobId: "JOB001" },
  });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /capacity/i);
});

test("applyForJob: rejects application when application deadline has passed", async (t) => {
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WORKER001" }));
  const jobFindByIdMock = mock.method(Job, "findById", async () => ({
    _id: "JOB001",
    status: "open",
    requiredWorkers: 2,
    filledWorkers: 0,
    applicationDeadline: new Date(Date.now() - 86400000), // yesterday
  }));
  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { jobId: "JOB001" },
  });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /deadline/i);
});

test("applyForJob: re-applying to a previously withdrawn application updates it to applied", async (t) => {
  const existingWithdrawnApp = {
    _id: "APP001",
    jobId: "JOB001",
    workerId: "WORKER001",
    status: "withdrawn",
    save: async function () {
      return this;
    },
  };

  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({
    _id: "WORKER001",
    fullName: "Worker One",
  }));
  const jobFindByIdMock = mock.method(Job, "findById", async () => ({
    _id: "JOB001",
    status: "open",
    employerId: "EMP001",
    requiredWorkers: 2,
    filledWorkers: 0,
  }));
  const workerSkillFindMock = mock.method(WorkerSkill, "find", async () => []);
  const appFindOneMock = mock.method(Application, "findOne", async () => existingWithdrawnApp);
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => null);
  const restoreFetch = mockFetchOnce(async () => fakeScoringResponse());

  t.after(() => {
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    workerSkillFindMock.mock.restore();
    appFindOneMock.mock.restore();
    employerFindByIdMock.mock.restore();
    restoreFetch();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { jobId: "JOB001", coverNote: "Re-applying after withdrawal" },
  });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(existingWithdrawnApp.status, "applied");
  assert.strictEqual(existingWithdrawnApp.coverNote, "Re-applying after withdrawal");
  assert.strictEqual(existingWithdrawnApp.matchScore, 85);
});

// --- 2. Withdrawal Lifecycle Tests ------------------------------------------

test("withdrawApplication: allows worker to withdraw applied application", async (t) => {
  const appDoc = {
    _id: "APP001",
    workerId: "WORKER001",
    status: "applied",
    save: async function () {
      return this;
    },
  };

  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WORKER001" }));
  const appFindOneMock = mock.method(Application, "findOne", async () => appDoc);

  t.after(() => {
    workerFindOneMock.mock.restore();
    appFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    params: { applicationId: "APP001" },
  });
  withdrawApplication(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(appDoc.status, "withdrawn");
});

test("withdrawApplication: rejects withdrawing an accepted application with 400", async (t) => {
  const appDoc = {
    _id: "APP001",
    workerId: "WORKER001",
    status: "accepted",
    save: async function () {
      return this;
    },
  };

  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WORKER001" }));
  const appFindOneMock = mock.method(Application, "findOne", async () => appDoc);

  t.after(() => {
    workerFindOneMock.mock.restore();
    appFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    params: { applicationId: "APP001" },
  });
  withdrawApplication(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /Cannot withdraw/i);
});

// --- 3. Shortlist Application Tests -----------------------------------------

test("shortlistApplication: employer can shortlist applied application", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001" },
    status: "applied",
    save: async function () {
      return this;
    },
  };

  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP001" }));
  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => appDoc,
  }));

  t.after(() => {
    empFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_EMP001" },
    params: { applicationId: "APP001" },
  });
  shortlistApplication(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(appDoc.status, "shortlisted");
});

test("shortlistApplication: unauthorized employer gets 403", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001" },
    status: "applied",
  };

  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "OTHER_EMP" }));
  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => appDoc,
  }));

  t.after(() => {
    empFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_OTHER" },
    params: { applicationId: "APP001" },
  });
  shortlistApplication(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
});

// --- 4. Accept / Reject State Transition Guards -----------------------------

test("acceptOrRejectApplication: cannot accept an application on a full job", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001", requiredWorkers: 1, filledWorkers: 1, status: "assigned" },
    workerId: { _id: "WP001", userId: "USER_W1" },
    status: "applied",
  };

  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP001" }));
  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => appDoc,
  }));
  // Capacity is enforced by MongoDB inside reserveWorkerSlot's filter now,
  // not by comparing a previously-read filledWorkers in JS. A full job
  // matches nothing, so the reservation returns null.
  const reserveMock = mock.method(Job, "findOneAndUpdate", async () => null);
  const appTransitionMock = mock.method(Application, "findOneAndUpdate", async () => {
    throw new Error("the application must not be transitioned when no slot could be reserved");
  });

  t.after(() => {
    empFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
    reserveMock.mock.restore();
    appTransitionMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_EMP001" },
    params: { applicationId: "APP001" },
    body: { status: "accepted" },
  });
  acceptOrRejectApplication(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /capacity/i);
  assert.strictEqual(appTransitionMock.mock.callCount(), 0, "no acceptance may be written without a slot");
});

test("acceptOrRejectApplication: cannot accept an application on a completed or cancelled job", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001", status: "completed" },
    workerId: { _id: "WP001", userId: "USER_W1" },
    status: "applied",
  };

  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP001" }));
  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => appDoc,
  }));

  t.after(() => {
    empFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_EMP001" },
    params: { applicationId: "APP001" },
    body: { status: "accepted" },
  });
  acceptOrRejectApplication(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /completed or cancelled/i);
});

test("acceptOrRejectApplication: cannot accept an application that is already rejected", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001", requiredWorkers: 2, filledWorkers: 0, status: "open" },
    workerId: { _id: "WP001", userId: "USER_W1" },
    status: "rejected",
  };

  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP001" }));
  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => appDoc,
  }));

  t.after(() => {
    empFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_EMP001" },
    params: { applicationId: "APP001" },
    body: { status: "accepted" },
  });
  acceptOrRejectApplication(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /rejected/i);
});

test("acceptOrRejectApplication: cannot reject an application that is already accepted", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001", status: "open" },
    workerId: { _id: "WP001", userId: "USER_W1" },
    status: "accepted",
  };

  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP001" }));
  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => appDoc,
  }));

  t.after(() => {
    empFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_EMP001" },
    params: { applicationId: "APP001" },
    body: { status: "rejected" },
  });
  acceptOrRejectApplication(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /Cannot reject/i);
});

// --- 5. Application Completion Tests ----------------------------------------

test("completeApplication: employer can mark accepted application as completed", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001" },
    status: "accepted",
    save: async function () {
      return this;
    },
  };

  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP001" }));
  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => appDoc,
  }));

  t.after(() => {
    empFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_EMP001" },
    params: { applicationId: "APP001" },
  });
  completeApplication(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(appDoc.status, "completed");
});

test("completeApplication: cannot complete an unaccepted application", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001" },
    status: "applied",
  };

  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP001" }));
  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: async () => appDoc,
  }));

  t.after(() => {
    empFindOneMock.mock.restore();
    appFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_EMP001" },
    params: { applicationId: "APP001" },
  });
  completeApplication(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

// --- 6. Single Application Retrieval & IDOR Tests ---------------------------

test("getApplicationById: applicant worker can view their own application", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001" },
    workerId: { _id: "WP001", userId: "USER_W1" },
    status: "applied",
  };

  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: () => ({
      populate: async () => appDoc,
    }),
  }));
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WP001" }));
  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => null);

  t.after(() => {
    appFindByIdMock.mock.restore();
    workerFindOneMock.mock.restore();
    empFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_W1", role: "worker" },
    params: { applicationId: "APP001" },
  });
  getApplicationById(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data._id, "APP001");
});

test("getApplicationById: unauthorized user gets 403", async (t) => {
  const appDoc = {
    _id: "APP001",
    jobId: { _id: "JOB001", employerId: "EMP001" },
    workerId: { _id: "WP001", userId: "USER_W1" },
    status: "applied",
  };

  const appFindByIdMock = mock.method(Application, "findById", () => ({
    populate: () => ({
      populate: async () => appDoc,
    }),
  }));
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "OTHER_WP" }));
  const empFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: "OTHER_EMP" }));

  t.after(() => {
    appFindByIdMock.mock.restore();
    workerFindOneMock.mock.restore();
    empFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER_STRANGER", role: "worker" },
    params: { applicationId: "APP001" },
  });
  getApplicationById(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
});
