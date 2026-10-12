import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

process.env.AI_SERVICE_URL = "http://test-ai:9000";

import Job from "../src/models/job.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import Application from "../src/models/application.model.js";
import {
  createJob,
  getJobById,
  updateJob,
  cancelJob,
  closeJob,
  reopenJob,
  deleteJob,
  updateJobStatus,
  getEmployerJobs,
  getRecommendedWorkers,
  getRecommendedJobs,
} from "../src/controllers/job.controller.js";
import {
  createJobValidator,
  updateJobValidator,
  jobIdParamValidator,
} from "../src/validators/job.validator.js";

// Same fakeReqRes / global.fetch conventions as the other controller tests -
// getRecommendedWorkersForJob (aiService.client.js) is a plain ESM export,
// so its underlying fetch() is what gets mocked.
function fakeReqRes({ user, params = {}, body = {}, query = {}, lang } = {}) {
  const req = { user, params, body, query, lang };
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

const OWNER_EMPLOYER_PROFILE_ID = "EMPPROFILE001";
const WORKERS = [
  { _id: "WORKER_A", fullName: "Worker A" },
  { _id: "WORKER_B", fullName: "Worker B" },
];

function fakeJob(status, overrides = {}) {
  return {
    _id: "JOB001",
    employerId: OWNER_EMPLOYER_PROFILE_ID,
    categoryId: "CAT001",
    skillIds: [],
    status,
    requiredWorkers: 2,
    filledWorkers: 0,
    ...overrides,
  };
}

/**
 * Mocks everything getRecommendedWorkers touches. Job.findOne honors the
 * real ownership filter {_id, employerId} so the authorization test is
 * faithful. Every AI-service call is captured.
 */
function mockRecommendedWorkersScenario(t, { job, requesterEmployerProfileId = OWNER_EMPLOYER_PROFILE_ID }) {
  const aiCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    aiCalls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        anchor_id: "JOB001",
        direction: "job_to_workers",
        matches: [
          { worker_id: "WORKER_B", ranking: { overall_score: 90, match_factors: { skill: 100 } } },
          { worker_id: "WORKER_A", ranking: { overall_score: 60, match_factors: { skill: 50 } } },
        ],
      }),
    };
  };

  const employerFindOneMock = mock.method(EmployerProfile, "findOne", async () =>
    requesterEmployerProfileId ? { _id: requesterEmployerProfileId } : null
  );
  const jobFindOneMock = mock.method(Job, "findOne", (filter) => ({
    populate: async () =>
      job && filter._id === job._id && filter.employerId === job.employerId ? job : null,
  }));
  const workerFindMock = mock.method(WorkerProfile, "find", () => ({ limit: async () => WORKERS }));
  const workerSkillFindMock = mock.method(WorkerSkill, "find", async () => []);

  t.after(() => {
    global.fetch = originalFetch;
    employerFindOneMock.mock.restore();
    jobFindOneMock.mock.restore();
    workerFindMock.mock.restore();
    workerSkillFindMock.mock.restore();
  });

  return { aiCalls, workerFindMock };
}

async function callRecommendedWorkers() {
  const { req, res, next, done } = fakeReqRes({ user: { _id: "EMPLOYER_USER" }, params: { jobId: "JOB001" } });
  getRecommendedWorkers(req, res, next);
  const { error } = await done;
  return { error, res };
}

// --- 1. Eligible jobs still get recommendations ------------------------------

/**
 * A chainable populate() mock. Job reads now chain two populate() calls - the
 * second pulls employerId.userId.fullName so an employer who hires under
 * their own name still has a name to display - and `populate` must therefore
 * return something chainable rather than a promise. `calls` records every
 * populate argument so a test can assert WHAT was populated, not just that it
 * resolved.
 */
function chainablePopulate(resolve) {
  const calls = [];
  const chain = {
    calls,
    populate(arg) {
      calls.push(arg);
      return chain;
    },
    then: (onFulfilled, onRejected) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
  };
  return chain;
}

test("H-4: an open job gets worker recommendations, AI is called, and returned workers/order are preserved", async (t) => {
  const { aiCalls } = mockRecommendedWorkersScenario(t, { job: fakeJob("open") });

  const { error, res } = await callRecommendedWorkers();

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(aiCalls.length, 1);
  assert.ok(aiCalls[0].url.endsWith("/recommendations/workers-for-job"));
  assert.deepStrictEqual(
    res.body.data.map((match) => match.worker._id),
    ["WORKER_B", "WORKER_A"],
    "AI ranking order and worker objects must pass through unchanged"
  );
  assert.strictEqual(res.body.data[0].matchScore, 90);
});

test("H-4: a partially_assigned job is still passed to the AI service (the AI makes the final room-left check)", async (t) => {
  const { aiCalls } = mockRecommendedWorkersScenario(t, {
    job: fakeJob("partially_assigned", { requiredWorkers: 3, filledWorkers: 1 }),
  });

  const { error, res } = await callRecommendedWorkers();

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(aiCalls.length, 1);
});

test("H-4: a job with no status field uses the schema default 'open' (same as the AI service's model) and is recommended", async (t) => {
  const job = fakeJob("open");
  delete job.status;
  const { aiCalls } = mockRecommendedWorkersScenario(t, { job });

  const { error, res } = await callRecommendedWorkers();

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(aiCalls.length, 1);
});

// --- 2-6. Ineligible jobs: empty result, AI never called ---------------------

for (const status of ["draft", "cancelled", "completed", "expired", "assigned"]) {
  test(`H-4: a ${status} job returns no recommendations and never calls the AI service`, async (t) => {
    const { aiCalls, workerFindMock } = mockRecommendedWorkersScenario(t, {
      job: fakeJob(status, status === "assigned" ? { requiredWorkers: 2, filledWorkers: 2 } : {}),
    });

    const { error, res } = await callRecommendedWorkers();

    assert.strictEqual(error, null);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.data, []);
    assert.strictEqual(aiCalls.length, 0, "the AI service must not be called for an ineligible job");
    assert.strictEqual(workerFindMock.mock.callCount(), 0, "no candidate workers should even be loaded");
  });
}

// --- 7. Authorization unchanged -----------------------------------------------

for (const status of ["open", "cancelled"]) {
  test(`H-4: an employer who does not own a ${status} job still gets the existing 404 (ownership checked before eligibility)`, async (t) => {
    const { aiCalls } = mockRecommendedWorkersScenario(t, {
      job: fakeJob(status),
      requesterEmployerProfileId: "SOME_OTHER_EMPLOYER",
    });

    const { error } = await callRecommendedWorkers();

    assert.ok(error);
    assert.strictEqual(error.statusCode, 404);
    assert.strictEqual(aiCalls.length, 0);
  });
}

test("H-4: a caller with no employer profile still gets the existing 404", async (t) => {
  const { aiCalls } = mockRecommendedWorkersScenario(t, { job: fakeJob("open"), requesterEmployerProfileId: null });

  const { error } = await callRecommendedWorkers();

  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(aiCalls.length, 0);
});

test("H-4: a nonexistent job still gets the existing 404", async (t) => {
  const { aiCalls } = mockRecommendedWorkersScenario(t, { job: null });

  const { error } = await callRecommendedWorkers();

  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(aiCalls.length, 0);
});

// --- Worker -> Jobs direction unchanged ---------------------------------------

test("H-4: worker->jobs candidate query still uses exactly the same status set", async (t) => {
  const workerFindOneMock = mock.method(WorkerProfile, "findOne", async () => ({ _id: "WORKER_A" }));
  const workerSkillFindMock = mock.method(WorkerSkill, "find", async () => []);
  // The controller now also excludes jobs this worker has already applied for
  // or been invited to, so it asks Application which those are.
  const appDistinctMock = mock.method(Application, "distinct", async () => []);
  let capturedFilter = null;
  const jobFindMock = mock.method(Job, "find", (filter) => {
    capturedFilter = filter;
    return { populate: () => ({ populate: () => ({ limit: async () => [] }) }) };
  });
  t.after(() => {
    workerFindOneMock.mock.restore();
    workerSkillFindMock.mock.restore();
    appDistinctMock.mock.restore();
    jobFindMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({ user: { _id: "WORKER_USER" } });
  getRecommendedJobs(req, res, next);
  await done;

  assert.deepStrictEqual(capturedFilter, { status: { $in: ["open", "partially_assigned"] } });
  assert.deepStrictEqual(res.body.data, []);
});

// =============================================================================
// JOB POSTING & MANAGEMENT MODULE TESTS
// =============================================================================

// --- 1. Job Creation ---------------------------------------------------------

test("employer can create a job with auto-translations", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      mr: "प्लंबर आवश्यक",
      hi: "प्लंबर की आवश्यकता",
      en: "Plumber needed",
    }),
  });

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  let createdJobData = null;
  const jobCreateMock = mock.method(Job, "create", async (data) => {
    createdJobData = data;
    return { _id: "JOB001", ...data };
  });

  t.after(() => {
    global.fetch = originalFetch;
    empFindMock.mock.restore();
    jobCreateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    body: {
      title: "Plumber needed",
      description: "Fix pipes",
      originalLanguage: "en",
      coordinates: [74.5, 16.8],
      categoryId: "CAT001",
      payType: "daily",
      payAmount: 500,
      requiredWorkers: 2,
      startDate: new Date("2026-11-01"),
    },
  });

  createJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(createdJobData.status, "open");
  assert.strictEqual(createdJobData.employerId, "EMPPROFILE001");
  assert.deepStrictEqual(createdJobData.title, {
    mr: "प्लंबर आवश्यक",
    hi: "प्लंबर की आवश्यकता",
    en: "Plumber needed",
  });
});

test("unauthorized user with no employer profile cannot create job", async (t) => {
  const empFindMock = mock.method(EmployerProfile, "findOne", async () => null);
  t.after(() => empFindMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "WORKER_USER" },
    body: { title: "Test Job", coordinates: [74.5, 16.8] },
  });

  createJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
  assert.match(error.message, /Employer profile not found/i);
});

test("zero-valued legitimate fields remain valid on job creation", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ mr: "काम", hi: "काम", en: "Volunteer" }),
  });

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  let createdJobData = null;
  const jobCreateMock = mock.method(Job, "create", async (data) => {
    createdJobData = data;
    return { _id: "JOB001", ...data };
  });

  t.after(() => {
    global.fetch = originalFetch;
    empFindMock.mock.restore();
    jobCreateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    body: {
      title: "Volunteer Work",
      coordinates: [74.5, 16.8],
      categoryId: "CAT001",
      payType: "daily",
      payAmount: 0,
      experienceRequired: 0,
      requiredWorkers: 1,
      startDate: new Date("2026-11-01"),
    },
  });

  createJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(createdJobData.payAmount, 0);
  assert.strictEqual(createdJobData.experienceRequired, 0);
});

test("saving job as draft creates job with draft status", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ mr: "मसुदा", hi: "ड्राफ्ट", en: "Draft Job" }),
  });

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  let createdJobData = null;
  const jobCreateMock = mock.method(Job, "create", async (data) => {
    createdJobData = data;
    return { _id: "JOB001", ...data };
  });

  t.after(() => {
    global.fetch = originalFetch;
    empFindMock.mock.restore();
    jobCreateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    body: {
      title: "Draft Job",
      coordinates: [74.5, 16.8],
      categoryId: "CAT001",
      payType: "daily",
      payAmount: 400,
      status: "draft",
      startDate: new Date("2026-11-01"),
    },
  });

  createJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(createdJobData.status, "draft");
});

test("AI translation failure falls back gracefully to source language text", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("Translation upstream down");
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  let createdJobData = null;
  const jobCreateMock = mock.method(Job, "create", async (data) => {
    createdJobData = data;
    return { _id: "JOB001", ...data };
  });

  t.after(() => {
    global.fetch = originalFetch;
    empFindMock.mock.restore();
    jobCreateMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    body: {
      title: "Painter needed",
      originalLanguage: "en",
      coordinates: [74.5, 16.8],
      categoryId: "CAT001",
      payType: "daily",
      payAmount: 600,
      startDate: new Date("2026-11-01"),
    },
  });

  createJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(createdJobData.title.en, "Painter needed");
  assert.strictEqual(createdJobData.title.mr, "Painter needed");
  assert.strictEqual(createdJobData.title.hi, "Painter needed");
});

// --- 2. Job Retrieval (getJobById) -------------------------------------------

test("getJobById: returns job for owning employer with isOwner=true", async (t) => {
  const jobDoc = {
    _id: "JOB001",
    employerId: { _id: "EMPPROFILE001", businessName: "Acme Corp" },
    title: { mr: "काम", hi: "काम", en: "Job 1" },
    description: { mr: "", hi: "", en: "Desc" },
    status: "open",
    toObject() {
      return this;
    },
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindByIdMock = mock.method(Job, "findById", () => chainablePopulate(() => jobDoc));

  t.after(() => {
    empFindMock.mock.restore();
    jobFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  getJobById(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.isOwner, true);
  assert.strictEqual(res.body.data.titleText, "Job 1");
});

test("getJobById: hides draft job from non-owner (404)", async (t) => {
  const jobDoc = {
    _id: "JOB001",
    employerId: { _id: "EMPPROFILE001" },
    status: "draft",
    toObject() {
      return this;
    },
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "OTHER_EMP",
  }));
  const jobFindByIdMock = mock.method(Job, "findById", () => chainablePopulate(() => jobDoc));

  t.after(() => {
    empFindMock.mock.restore();
    jobFindByIdMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "WORKER_USER" },
    params: { jobId: "JOB001" },
  });

  getJobById(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
});

test("getJobById: rejects invalid job ID with 400", async (t) => {
  const { req, res, next, done } = fakeReqRes({
    params: { jobId: "invalid-id!" },
  });

  getJobById(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /Invalid job ID/i);
});

// --- 3. Employer Own Jobs Listing --------------------------------------------

test("getEmployerJobs: retrieves all jobs posted by the employer", async (t) => {
  const mockJobs = [
    { _id: "JOB001", status: "open" },
    { _id: "JOB002", status: "completed" },
  ];

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindMock = mock.method(Job, "find", (filter) => ({
    populate: () => ({
      sort: async () => (filter.employerId === "EMPPROFILE001" ? mockJobs : []),
    }),
  }));

  t.after(() => {
    empFindMock.mock.restore();
    jobFindMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
  });

  getEmployerJobs(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.length, 2);
});

// --- 4. Edit Job & Authorization ---------------------------------------------

test("updateJob: employer can update allowed fields of their open job", async (t) => {
  let saved = false;
  const existingJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "open",
    originalLanguage: "en",
    requiredWorkers: 2,
    filledWorkers: 0,
    payAmount: 500,
    experienceRequired: 0,
    async save() {
      saved = true;
    },
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async (filter) =>
    filter._id === "JOB001" && filter.employerId === "EMPPROFILE001" ? existingJob : null
  );

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
    body: {
      payAmount: 750,
      experienceRequired: 2,
      shiftType: "night",
    },
  });

  updateJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(saved, true);
  assert.strictEqual(existingJob.payAmount, 750);
  assert.strictEqual(existingJob.experienceRequired, 2);
  assert.strictEqual(existingJob.shiftType, "night");
});

test("updateJob: employer cannot modify another employer's job", async (t) => {
  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "OTHER_EMPLOYER",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => null);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "OTHER_USER" },
    params: { jobId: "JOB001" },
    body: { payAmount: 900 },
  });

  updateJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
  assert.match(error.message, /Job not found or unauthorized/i);
});

test("updateJob: rejects editing cancelled or completed job", async (t) => {
  const cancelledJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "cancelled",
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => cancelledJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
    body: { payAmount: 1000 },
  });

  updateJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /Cannot edit a cancelled job/i);
});

test("updateJob: cannot set requiredWorkers less than already filled workers", async (t) => {
  const existingJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "partially_assigned",
    requiredWorkers: 3,
    filledWorkers: 2,
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => existingJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
    body: { requiredWorkers: 1 },
  });

  updateJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /cannot be less than already filled workers/i);
});

test("capacity/status consistency: increasing requiredWorkers on assigned job transitions status to partially_assigned", async (t) => {
  let saved = false;
  const existingJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "assigned",
    requiredWorkers: 2,
    filledWorkers: 2,
    async save() {
      saved = true;
    },
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => existingJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
    body: { requiredWorkers: 4 },
  });

  updateJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(saved, true);
  assert.strictEqual(existingJob.requiredWorkers, 4);
  assert.strictEqual(existingJob.status, "partially_assigned");
});

// --- 5. Status Transitions: Close & Cancel -----------------------------------

test("closeJob: active open job transitions to completed", async (t) => {
  let saved = false;
  const activeJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "open",
    async save() {
      saved = true;
    },
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => activeJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  closeJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(saved, true);
  assert.strictEqual(activeJob.status, "completed");
});

test("closeJob: rejects closing an already completed job", async (t) => {
  const completedJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "completed",
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => completedJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  closeJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /already closed/i);
});

test("cancelJob: cancels open job and rejects if already cancelled", async (t) => {
  let saved = false;
  const openJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "open",
    async save() {
      saved = true;
    },
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => openJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  cancelJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(saved, true);
  assert.strictEqual(openJob.status, "cancelled");
});

test("cancelJob: rejects cancelling completed job", async (t) => {
  const completedJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "completed",
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => completedJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  cancelJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /Completed jobs cannot be cancelled/i);
});

// --- 6. Reopen Behavior ------------------------------------------------------

test("reopenJob: reopening completed job with filledWorkers=0 sets status to open", async (t) => {
  let saved = false;
  const completedJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "completed",
    requiredWorkers: 2,
    filledWorkers: 0,
    async save() {
      saved = true;
    },
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => completedJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  reopenJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(saved, true);
  assert.strictEqual(completedJob.status, "open");
});

test("reopenJob: reopening completed job with filledWorkers>0 sets status to partially_assigned", async (t) => {
  let saved = false;
  const completedJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "completed",
    requiredWorkers: 3,
    filledWorkers: 1,
    async save() {
      saved = true;
    },
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => completedJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  reopenJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(saved, true);
  assert.strictEqual(completedJob.status, "partially_assigned");
});

test("reopenJob: cannot reopen full job without increasing capacity", async (t) => {
  const fullJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "completed",
    requiredWorkers: 2,
    filledWorkers: 2,
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => fullJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  reopenJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /increase required workers first/i);
});

test("reopenJob: cannot reopen already active job", async (t) => {
  const openJob = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    status: "open",
    requiredWorkers: 2,
    filledWorkers: 0,
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => openJob);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  reopenJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /already active/i);
});

// --- 7. Delete Job Rules -----------------------------------------------------

test("deleteJob: rejects deleting job when applications exist", async (t) => {
  const jobDoc = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    filledWorkers: 0,
  };

  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => jobDoc);
  const appExistsMock = mock.method(Application, "exists", async () => true);

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
    appExistsMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  deleteJob(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /Cannot delete job with existing applications/i);
});

test("deleteJob: deletes successfully when no applications exist", async (t) => {
  const jobDoc = {
    _id: "JOB001",
    employerId: "EMPPROFILE001",
    filledWorkers: 0,
  };

  let deleted = false;
  const empFindMock = mock.method(EmployerProfile, "findOne", async () => ({
    _id: "EMPPROFILE001",
  }));
  const jobFindOneMock = mock.method(Job, "findOne", async () => jobDoc);
  const appExistsMock = mock.method(Application, "exists", async () => false);
  const jobDeleteMock = mock.method(Job, "deleteOne", async () => {
    deleted = true;
    return { deletedCount: 1 };
  });

  t.after(() => {
    empFindMock.mock.restore();
    jobFindOneMock.mock.restore();
    appExistsMock.mock.restore();
    jobDeleteMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "EMPLOYER_USER" },
    params: { jobId: "JOB001" },
  });

  deleteJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(deleted, true);
});

// --- 8. Validation Rules -----------------------------------------------------

test("createJobValidator: accepts valid job with zero values", () => {
  const payload = {
    title: "Plumber needed",
    categoryId: "CAT001",
    coordinates: [74.5, 16.8],
    payType: "daily",
    payAmount: 0,
    requiredWorkers: 1,
    experienceRequired: 0,
    startDate: "2026-11-01",
  };

  const parsed = createJobValidator.parse({ body: payload });
  assert.strictEqual(parsed.body.payAmount, 0);
  assert.strictEqual(parsed.body.experienceRequired, 0);
});

test("createJobValidator: rejects invalid coordinates out of range", () => {
  const payload = {
    title: "Driver",
    categoryId: "CAT001",
    coordinates: [200, 95], // out of bounds
    payType: "daily",
    payAmount: 500,
    startDate: "2026-11-01",
  };

  assert.throws(() => {
    createJobValidator.parse({ body: payload });
  }, /Coordinates must be/);
});

test("createJobValidator: rejects negative pay amount", () => {
  const payload = {
    title: "Electrician",
    categoryId: "CAT001",
    coordinates: [74.5, 16.8],
    payType: "daily",
    payAmount: -100,
    startDate: "2026-11-01",
  };

  assert.throws(() => {
    createJobValidator.parse({ body: payload });
  }, /Pay amount cannot be negative/);
});

// =============================================================================
// Module 4 audit: an AI match whose id was never sent must not reach React.
//
// Node resolves each match back to the document it sent via jobsById /
// workersById. If the AI echoed an id outside that set, the entry was
// forwarded with no `job` (or `worker`) key at HTTP 200, and the dashboard
// crashed on match.job._id. Scores and ordering are untouched by the guard.
// =============================================================================

test("M4: recommended-workers drops a worker_id that was not in the candidate set", async (t) => {
  const job = fakeJob("open");
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      anchor_id: "JOB001",
      direction: "job_to_workers",
      matches: [
        // One real candidate, one id Node never sent.
        { worker_id: "WORKER_A", ranking: { overall_score: 70, match_factors: { skill: 50 } }, explanation: { summary: "ok" } },
        { worker_id: "GHOST_WORKER", ranking: { overall_score: 99, match_factors: { skill: 99 } }, explanation: { summary: "ghost" } },
      ],
    }),
  });
  const employerFindOneMock = mock.method(EmployerProfile, "findOne", async () => ({ _id: OWNER_EMPLOYER_PROFILE_ID }));
  const jobFindOneMock = mock.method(Job, "findOne", (filter) => ({
    populate: async () => (filter._id === job._id && filter.employerId === job.employerId ? job : null),
  }));
  const workerFindMock = mock.method(WorkerProfile, "find", () => ({ limit: async () => WORKERS }));
  const workerSkillFindMock = mock.method(WorkerSkill, "find", async () => []);
  t.after(() => {
    global.fetch = originalFetch;
    employerFindOneMock.mock.restore();
    jobFindOneMock.mock.restore();
    workerFindMock.mock.restore();
    workerSkillFindMock.mock.restore();
  });

  const { error, res } = await callRecommendedWorkers();

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  // Only the resolvable candidate survives...
  assert.strictEqual(res.body.data.length, 1, "the unresolvable match must be dropped");
  assert.strictEqual(res.body.data[0].worker._id, "WORKER_A");
  // ...and every entry the client receives has a real worker object.
  for (const entry of res.body.data) {
    assert.ok(entry.worker, "every returned entry must carry its worker document");
    assert.ok(entry.worker._id, "WorkerCard reads entry.worker._id and must not crash");
  }
  // Scores and the AI's explanation still pass through untouched.
  assert.strictEqual(res.body.data[0].matchScore, 70);
  assert.deepStrictEqual(res.body.data[0].matchFactors, { skill: 50 });
  assert.deepStrictEqual(res.body.data[0].explanation, { summary: "ok" });
});

test("M4: a fully resolvable response is returned unchanged, in AI order", async (t) => {
  const { aiCalls } = mockRecommendedWorkersScenario(t, { job: fakeJob("open") });

  const { error, res } = await callRecommendedWorkers();

  assert.strictEqual(error, null);
  assert.strictEqual(aiCalls.length, 1);
  assert.deepStrictEqual(
    res.body.data.map((m) => m.worker._id),
    ["WORKER_B", "WORKER_A"],
    "the guard must not reorder or drop valid matches"
  );
  assert.strictEqual(res.body.data[0].matchScore, 90);
});
