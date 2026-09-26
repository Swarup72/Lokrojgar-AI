import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import WorkerProfile from "../src/models/workerProfile.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import Job from "../src/models/job.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import Application from "../src/models/application.model.js";

import { getRecommendedJobs, getRecommendedWorkers } from "../src/controllers/job.controller.js";
import { applyForJob } from "../src/controllers/application.controller.js";

/**
 * These tests mock:
 *   - Mongoose model static methods (findOne/find/create/etc.) directly on
 *     the shared Model objects - safe, since both this test file and the
 *     controllers import the SAME model instance (mutating a shared
 *     object's property, not reassigning an ES module binding).
 *   - global.fetch - the actual network boundary aiService.client.js calls
 *     through - so the AI service itself is mocked without needing to
 *     monkey-patch aiService.client.js's own ES module exports (which,
 *     being live-binding ESM exports, can't be reassigned from outside).
 *
 * No real MongoDB connection and no real FastAPI process are used or
 * required by this file.
 *
 * Note on synchronization: asyncHandler.js's wrapper does not return its
 * internal promise chain (Express never needs it to - it just eventually
 * calls res.json()/next()). That means `await controller(req, res, next)`
 * resolves immediately, before the controller's actual async work
 * finishes. fakeReqRes() below returns a `done` promise that resolves
 * only once res.json() or next(err) actually fires, and every test awaits
 * that instead.
 */

function fakeReqRes({ user, params = {}, body = {} } = {}) {
  const req = { user, params, body };
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

function mockFetchOnce(responseFactory) {
  const originalFetch = global.fetch;
  global.fetch = mock.fn(async (url, options) => responseFactory(url, options));
  return () => {
    global.fetch = originalFetch;
  };
}

test("getRecommendedJobs calls the AI service (not the legacy matcher) and returns its result", async () => {
  const worker = { _id: "WORKER001", userId: "USER001", fullName: "Test Worker" };
  const job = { _id: { toString: () => "JOB001" }, toObject: () => ({ _id: "JOB001", title: { en: "Job" } }) };

  const restoreFetch = mockFetchOnce(async (url) => {
    assert.match(url, /\/recommendations\/jobs-for-worker$/);
    return {
      ok: true,
      json: async () => ({
        anchor_id: "WORKER001",
        direction: "worker_to_jobs",
        matches: [
          {
            worker_id: "WORKER001",
            job_id: "JOB001",
            ranking: {
              overall_score: 72.5,
              match_factors: { skill: 80, location: 90, availability: 100, pay: null, rating: null, relevance: 50 },
              available_factors: ["skill", "location", "availability", "relevance"],
              unavailable_factors: ["pay", "rating"],
            },
            explanation: { overall_score: 72.5, factors: [], summary: "" },
          },
        ],
      }),
    };
  });

  const findOneMock = mock.method(WorkerProfile, "findOne", async () => worker);
  const skillFindMock = mock.method(WorkerSkill, "find", async () => []);
  const jobFindMock = mock.method(Job, "find", () => ({
    populate: () => ({
      limit: async () => [job],
    }),
  }));

  try {
    const { req, res, next, done } = fakeReqRes({ user: { _id: "USER001" } });
    getRecommendedJobs(req, res, next);
    const { error } = await done;

    assert.strictEqual(error, null);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.length, 1);
    assert.strictEqual(res.body.data[0].matchScore, 72.5);
    // pay/rating stay null - never coerced to 0 by the controller.
    assert.strictEqual(res.body.data[0].matchFactors.pay, null);
    assert.strictEqual(res.body.data[0].matchFactors.rating, null);
    assert.strictEqual(res.body.data[0].matchFactors.skill, 80);
  } finally {
    restoreFetch();
    findOneMock.mock.restore();
    skillFindMock.mock.restore();
    jobFindMock.mock.restore();
  }
});

test("getRecommendedWorkers (new endpoint) calls the AI service for Job -> Workers", async () => {
  const employerProfile = { _id: "EMP001", userId: "USER_EMPLOYER" };
  const job = {
    _id: "JOB001",
    toObject: () => ({ _id: "JOB001", title: { en: "Job" } }),
    populate: async function () {
      return this;
    },
  };
  const worker = { _id: { toString: () => "WORKER001" }, fullName: "Test Worker" };

  const restoreFetch = mockFetchOnce(async (url) => {
    assert.match(url, /\/recommendations\/workers-for-job$/);
    return {
      ok: true,
      json: async () => ({
        anchor_id: "JOB001",
        direction: "job_to_workers",
        matches: [
          {
            worker_id: "WORKER001",
            job_id: "JOB001",
            ranking: {
              overall_score: 60.0,
              match_factors: { skill: 50, location: 70, availability: 100, pay: null, rating: null, relevance: 40 },
              available_factors: ["skill", "location", "availability", "relevance"],
              unavailable_factors: ["pay", "rating"],
            },
            explanation: { overall_score: 60.0, factors: [], summary: "" },
          },
        ],
      }),
    };
  });

  const employerFindOneMock = mock.method(EmployerProfile, "findOne", async () => employerProfile);
  const jobFindOneMock = mock.method(Job, "findOne", () => ({
    populate: async () => job,
  }));
  const workerFindMock = mock.method(WorkerProfile, "find", () => ({
    limit: async () => [worker],
  }));
  const skillFindMock = mock.method(WorkerSkill, "find", async () => []);

  try {
    const { req, res, next, done } = fakeReqRes({ user: { _id: "USER_EMPLOYER" }, params: { jobId: "JOB001" } });
    getRecommendedWorkers(req, res, next);
    const { error } = await done;

    assert.strictEqual(error, null);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.length, 1);
    assert.strictEqual(res.body.data[0].matchScore, 60.0);
  } finally {
    restoreFetch();
    employerFindOneMock.mock.restore();
    jobFindOneMock.mock.restore();
    workerFindMock.mock.restore();
    skillFindMock.mock.restore();
  }
});

test("applyForJob calls score-pair and persists matchScore AND matchFactors (including null pay/rating)", async () => {
  const worker = { _id: "WORKER001", fullName: "Test Worker" };
  const job = { _id: "JOB001", status: "open", employerId: "EMP001", title: { en: "Job" } };

  const restoreFetch = mockFetchOnce(async (url) => {
    assert.match(url, /\/recommendations\/score-pair$/);
    return {
      ok: true,
      json: async () => ({
        worker_id: "WORKER001",
        job_id: "JOB001",
        ranking: {
          overall_score: 65.0,
          match_factors: { skill: 60, location: 80, availability: 100, pay: null, rating: null, relevance: 40 },
          available_factors: ["skill", "location", "availability", "relevance"],
          unavailable_factors: ["pay", "rating"],
        },
        explanation: { overall_score: 65.0, factors: [], summary: "" },
      }),
    };
  });

  let createdApplicationPayload = null;

  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => worker);
  const jobFindByIdMock = mock.method(Job, "findById", async () => job);
  const appFindOneMock = mock.method(Application, "findOne", async () => null);
  const skillFindMock = mock.method(WorkerSkill, "find", async () => []);
  const appCreateMock = mock.method(Application, "create", async (payload) => {
    createdApplicationPayload = payload;
    return { _id: "APP001", ...payload };
  });
  // No device to notify -> sendNotificationService's real Mongoose calls
  // (which would hang without a live DB connection) are never reached.
  const employerFindByIdMock = mock.method(EmployerProfile, "findById", async () => null);

  try {
    const { req, res, next, done } = fakeReqRes({
      user: { _id: "USER001" },
      body: { jobId: "JOB001", coverNote: "" },
    });
    applyForJob(req, res, next);
    const { error } = await done;

    assert.strictEqual(error, null);
    assert.strictEqual(res.statusCode, 201);
    assert.ok(createdApplicationPayload, "Application.create should have been called");
    assert.strictEqual(createdApplicationPayload.matchScore, 65.0);
    assert.deepStrictEqual(createdApplicationPayload.matchFactors, {
      skill: 60,
      location: 80,
      availability: 100,
      pay: null,
      rating: null,
      relevance: 40,
    });
    // The known pre-existing bug (matchFactors computed but never
    // persisted) is fixed: it's now part of the create() payload.
    assert.strictEqual(createdApplicationPayload.matchFactors.pay, null);
    assert.strictEqual(createdApplicationPayload.matchFactors.rating, null);
  } finally {
    restoreFetch();
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    appFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    appCreateMock.mock.restore();
    employerFindByIdMock.mock.restore();
  }
});

test("applyForJob fails clearly (does not create an application) when the AI service is unreachable", async () => {
  const worker = { _id: "WORKER001", fullName: "Test Worker" };
  const job = { _id: "JOB001", status: "open", employerId: "EMP001", title: { en: "Job" } };

  const originalFetch = global.fetch;
  global.fetch = mock.fn(async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
  });

  let applicationCreateCalled = false;
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => worker);
  const jobFindByIdMock = mock.method(Job, "findById", async () => job);
  const appFindOneMock = mock.method(Application, "findOne", async () => null);
  const skillFindMock = mock.method(WorkerSkill, "find", async () => []);
  const appCreateMock = mock.method(Application, "create", async (payload) => {
    applicationCreateCalled = true;
    return { _id: "APP001", ...payload };
  });

  try {
    const { req, res, next, done } = fakeReqRes({
      user: { _id: "USER001" },
      body: { jobId: "JOB001", coverNote: "" },
    });
    applyForJob(req, res, next);
    const { error } = await done;

    assert.ok(error, "an error should have been forwarded to next()");
    assert.strictEqual(error.statusCode, 503);
    assert.strictEqual(
      applicationCreateCalled,
      false,
      "no Application should be created when scoring fails - never fall back to a fabricated score"
    );
  } finally {
    global.fetch = originalFetch;
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    appFindOneMock.mock.restore();
    skillFindMock.mock.restore();
    appCreateMock.mock.restore();
  }
});

test("applyForJob still rejects a duplicate application before any AI call is made", async () => {
  const worker = { _id: "WORKER001", fullName: "Test Worker" };
  const job = { _id: "JOB001", status: "open", employerId: "EMP001" };

  let fetchWasCalled = false;
  const originalFetch = global.fetch;
  global.fetch = mock.fn(async () => {
    fetchWasCalled = true;
    return { ok: true, json: async () => ({}) };
  });

  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => worker);
  const jobFindByIdMock = mock.method(Job, "findById", async () => job);
  const appFindOneMock = mock.method(Application, "findOne", async () => ({ status: "applied" }));

  try {
    const { req, res, next, done } = fakeReqRes({
      user: { _id: "USER001" },
      body: { jobId: "JOB001", coverNote: "" },
    });
    applyForJob(req, res, next);
    const { error } = await done;

    assert.ok(error);
    assert.strictEqual(error.statusCode, 409);
    assert.strictEqual(fetchWasCalled, false, "AI service must not be called for a rejected duplicate application");
  } finally {
    global.fetch = originalFetch;
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
    appFindOneMock.mock.restore();
  }
});

test("applyForJob still rejects applying to a non-open job before any AI call is made", async () => {
  const worker = { _id: "WORKER001", fullName: "Test Worker" };
  const job = { _id: "JOB001", status: "assigned", employerId: "EMP001" };

  let fetchWasCalled = false;
  const originalFetch = global.fetch;
  global.fetch = mock.fn(async () => {
    fetchWasCalled = true;
    return { ok: true, json: async () => ({}) };
  });

  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => worker);
  const jobFindByIdMock = mock.method(Job, "findById", async () => job);

  try {
    const { req, res, next, done } = fakeReqRes({
      user: { _id: "USER001" },
      body: { jobId: "JOB001", coverNote: "" },
    });
    applyForJob(req, res, next);
    const { error } = await done;

    assert.ok(error);
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(fetchWasCalled, false);
  } finally {
    global.fetch = originalFetch;
    workerFindOneMock.mock.restore();
    jobFindByIdMock.mock.restore();
  }
});
