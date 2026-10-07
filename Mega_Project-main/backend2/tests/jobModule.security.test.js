import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

process.env.AI_SERVICE_URL = "http://test-ai:9000";

import Job from "../src/models/job.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import jobRouter from "../src/routes/job.routes.js";
import { app } from "../src/app.js";
import { updateJobStatus, searchAndFilterJobs } from "../src/controllers/job.controller.js";

// Regression tests for defects found during the independent review of the
// Job Posting & Management module. Each one failed before its fix.

function fakeReqRes({ user, body = {}, params = {}, query = {} } = {}) {
  const req = { user, body, params, query };
  let settle;
  const done = new Promise((resolve) => { settle = resolve; });
  const res = {
    statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; settle({ error: null }); return this; },
  };
  const next = (err) => settle({ error: err ?? new Error("next() with no error") });
  return { req, res, next, done };
}

// --- DEFECT 1 (critical): status delegation dropped `next` ------------------
// closeJob/cancelJob/reopenJob are asyncHandler-wrapped, so on failure they
// call next(err). updateJobStatus invoked them as fn(req, res), leaving next
// undefined; the resulting "TypeError: next is not a function" escaped as an
// unhandledRejection, which index.js treats as fatal. One repeated status
// change took the entire backend process down.

test("repeating PATCH status=completed yields a clean 400 instead of crashing the process", async (t) => {
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP1" })),
    mock.method(Job, "findOne", async () => ({ _id: "JOB1", employerId: "EMP1", status: "completed" })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "U1" }, params: { jobId: "507f1f77bcf86cd799439011" }, body: { status: "completed" },
  });
  updateJobStatus(req, res, next);
  const { error } = await done;

  assert.ok(error, "the delegated handler's error must reach next()");
  assert.strictEqual(error.statusCode, 400);
  assert.ok(!(error instanceof TypeError), "must not be 'next is not a function'");
  assert.doesNotMatch(String(error.message), /next is not a function/);
});

test("PATCH status=cancelled on an already-cancelled job also reaches next cleanly", async (t) => {
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP1" })),
    mock.method(Job, "findOne", async () => ({ _id: "JOB1", employerId: "EMP1", status: "cancelled" })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "U1" }, params: { jobId: "507f1f77bcf86cd799439011" }, body: { status: "cancelled" },
  });
  updateJobStatus(req, res, next);
  const { error } = await done;

  assert.strictEqual(error.statusCode, 400);
  assert.doesNotMatch(String(error.message), /next is not a function/);
});

test("a successful delegated status change still returns 200", async (t) => {
  const job = { _id: "JOB1", employerId: "EMP1", status: "open", save: async () => {} };
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP1" })),
    mock.method(Job, "findOne", async () => job),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "U1" }, params: { jobId: "507f1f77bcf86cd799439011" }, body: { status: "completed" },
  });
  updateJobStatus(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(job.status, "completed");
});

// --- DEFECT 2 (high): public search leaked drafts ---------------------------

test("public /jobs/search cannot list drafts", async (t) => {
  const findMock = mock.method(Job, "find", () => {
    throw new Error("Job.find must not run for a draft search");
  });
  t.after(() => findMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({ query: { status: "draft" } });
  searchAndFilterJobs(req, res, next);
  const { error } = await done;

  assert.strictEqual(error.statusCode, 400);
  assert.match(error.message, /private/i);
  assert.strictEqual(findMock.mock.callCount(), 0, "no query may be issued for drafts");
});

test("public /jobs/search still works for ordinary statuses", async (t) => {
  let captured = null;
  const mocks = [
    mock.method(Job, "find", (filter) => {
      captured = filter;
      return {
        populate: () => ({
          populate: () => ({ sort: () => ({ skip: () => ({ limit: async () => [] }) }) }),
        }),
      };
    }),
    mock.method(Job, "countDocuments", async () => 0),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({ query: {} });
  searchAndFilterJobs(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(captured.status, "open", "the default public status is unchanged");
});

// --- DEFECT 3 (high): /:jobId shadowed the literal /recommended route -------

test("GET /recommended is registered before the /:jobId wildcard", () => {
  const paths = jobRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  const recommendedAt = paths.indexOf("/recommended");
  const wildcardAt = paths.indexOf("/:jobId");

  assert.ok(recommendedAt !== -1, "/recommended must be registered");
  assert.ok(wildcardAt !== -1, "/:jobId must be registered");
  assert.ok(
    recommendedAt < wildcardAt,
    `Express matches in order: /recommended (${recommendedAt}) must precede /:jobId (${wildcardAt}), ` +
      "or worker recommendations are captured as jobId='recommended'"
  );
});

test("every literal single-segment job route precedes the /:jobId wildcard", () => {
  const paths = jobRouter.stack.filter((l) => l.route).map((l) => l.route.path);
  const wildcardAt = paths.indexOf("/:jobId");
  const shadowed = paths.filter(
    (p, i) => i > wildcardAt && !p.includes(":") && p.split("/").filter(Boolean).length === 1
  );
  assert.deepStrictEqual(shadowed, [], `these literal routes are unreachable: ${shadowed.join(", ")}`);
});

// --- DEFECT 4 (medium): a malformed ObjectId surfaced as 500 ----------------
// error.middleware.js classified CastError as 400 but is not the handler
// app.js actually mounts, so a cast failure reached the client as a 500.

test("a Mongoose CastError is returned as 400 Malformed ID format, not 500", async (t) => {
  const castError = new Error('Cast to ObjectId failed for value "nope"');
  castError.name = "CastError";
  const findMock = mock.method(Job, "findById", () => { throw castError; });
  t.after(() => findMock.mock.restore());

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const port = server.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/jobs/507f1f77bcf86cd799439011`);
  const body = await response.json();

  assert.strictEqual(response.status, 400, "a malformed id is a bad request, not a server fault");
  assert.strictEqual(body.success, false);
  assert.strictEqual(body.message, "Malformed ID format");
  assert.doesNotMatch(body.message, /Cast to ObjectId/, "must not echo the raw Mongoose message");
});
