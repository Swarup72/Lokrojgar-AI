/**
 * The employer-contact privacy boundary.
 *
 * A worker already sees, from the ordinary public job read, the employer's
 * DISPLAY NAME and the JOB's own location - enough to judge the work and travel
 * to it. The employer's PHONE NUMBER is released only once a hiring
 * relationship exists, through GET /jobs/:jobId/employer-contact.
 *
 * (For contrast, the retired GET /offers/search-talent returned every worker
 * profile with `userId.phone` populated to any employer, with no relationship at
 * all - 6 phone numbers in one measured response.)
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import Job from "../src/models/job.model.js";
import Application from "../src/models/application.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import { getJobEmployerContact } from "../src/controllers/job.controller.js";
import { employerDisplayName, workerDisplayName } from "../src/utils/displayName.js";

const JOB_ID = "507f1f77bcf86cd799480001";
const EMPLOYER_PROFILE_ID = "507f1f77bcf86cd799480002";
const WORKER_USER = "507f1f77bcf86cd799480003";
const WORKER_PROFILE_ID = "507f1f77bcf86cd799480004";

function fakeReqRes({ user, params = {} } = {}) {
  const req = { user, params, body: {}, query: {} };
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

function mockContact(t, { applicationStatus, businessName = "Patil Builders" } = {}) {
  let capturedSelect = null;
  const mocks = [
    mock.method(Job, "findById", async () => ({ _id: JOB_ID, employerId: EMPLOYER_PROFILE_ID })),
    mock.method(WorkerProfile, "findOne", async () => ({ _id: WORKER_PROFILE_ID, userId: WORKER_USER })),
    mock.method(Application, "findOne", async (filter) => {
      const wanted = filter.status?.$in || [];
      if (!applicationStatus || !wanted.includes(applicationStatus)) return null;
      return { _id: "APP1", status: applicationStatus };
    }),
    mock.method(EmployerProfile, "findById", () => ({
      populate: async (path, select) => {
        capturedSelect = select;
        return {
          _id: EMPLOYER_PROFILE_ID,
          businessName,
          businessType: "construction",
          city: "Pune",
          village: null,
          isVerified: true,
          location: { type: "Point", coordinates: [73.85, 18.52] },
          userId: { _id: "EMP_USER", phone: "9876500001", fullName: "Rahul Patil" },
        };
      },
    })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
  return { getSelect: () => capturedSelect };
}

for (const status of ["applied", "invited", "shortlisted", "rejected", "declined", "withdrawn", null]) {
  test(`contact is WITHHELD when the application is ${status || "absent"}`, async (t) => {
    mockContact(t, { applicationStatus: status });

    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      params: { jobId: JOB_ID },
    });
    getJobEmployerContact(req, res, next);
    const { error } = await done;

    assert.ok(error, `status ${status} must not release a phone number`);
    assert.strictEqual(error.statusCode, 403);
    assert.match(error.message, /accepted/i, "the message must say when it unlocks");
    assert.strictEqual(res.body, null, "nothing may be returned");
  });
}

for (const status of ["accepted", "completed"]) {
  test(`contact IS released once the application is ${status}`, async (t) => {
    mockContact(t, { applicationStatus: status });

    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      params: { jobId: JOB_ID },
    });
    getJobEmployerContact(req, res, next);
    const { error } = await done;

    assert.strictEqual(error, null);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.phone, "9876500001");
    assert.strictEqual(res.body.data.employerName, "Patil Builders");
    // The employer's own location is distinct from the job site, and labelled so.
    assert.deepStrictEqual(res.body.data.employerLocation.coordinates, [73.85, 18.52]);
  });
}

test("completing the work does not withdraw the contact details", async (t) => {
  // A worker still has to settle up with the person who hired them.
  mockContact(t, { applicationStatus: "completed" });
  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, params: { jobId: JOB_ID } });
  getJobEmployerContact(req, res, next);
  const { error } = await done;
  assert.strictEqual(error, null);
  assert.ok(res.body.data.phone);
});

test("only the name and phone are selected from the employer's User document", async (t) => {
  const { getSelect } = mockContact(t, { applicationStatus: "accepted" });

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, params: { jobId: JOB_ID } });
  getJobEmployerContact(req, res, next);
  await done;

  const select = getSelect();
  assert.ok(select.includes("phone"));
  assert.ok(select.includes("fullName"));
  for (const forbidden of ["passwordHash", "fraudScore", "isBlocked", "email", "roles"]) {
    assert.ok(!select.includes(forbidden), `${forbidden} must never be loaded here`);
  }
});

test("the response carries no account internals, even by accident", async (t) => {
  mockContact(t, { applicationStatus: "accepted" });
  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, params: { jobId: JOB_ID } });
  getJobEmployerContact(req, res, next);
  await done;

  const serialized = JSON.stringify(res.body.data);
  for (const forbidden of ["passwordHash", "refreshToken", "fraudScore", "isBlocked", "roles", "_id"]) {
    assert.ok(!serialized.includes(forbidden), `${forbidden} leaked into the contact response`);
  }
});

test("a worker with no worker profile cannot reach the endpoint at all", async (t) => {
  const mocks = [
    mock.method(Job, "findById", async () => ({ _id: JOB_ID, employerId: EMPLOYER_PROFILE_ID })),
    mock.method(WorkerProfile, "findOne", async () => null),
    mock.method(Application, "findOne", async () => {
      throw new Error("the relationship must not even be looked up without a profile");
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({ user: { _id: "NOBODY" }, params: { jobId: JOB_ID } });
  getJobEmployerContact(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
});

test("a malformed job id is a 400, never a 500", async (t) => {
  mockContact(t, { applicationStatus: "accepted" });
  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, params: { jobId: "@@@" } });
  getJobEmployerContact(req, res, next);
  const { error } = await done;
  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

// --- the display-name fallback itself ---------------------------------------

test("employerDisplayName: business name, else the person's name, else null", () => {
  assert.strictEqual(employerDisplayName({ businessName: "Patil Builders" }, { fullName: "Rahul" }), "Patil Builders");
  // The product change: no business name means the employer is shown by name.
  assert.strictEqual(employerDisplayName({ businessName: null }, { fullName: "Rahul Patil" }), "Rahul Patil");
  assert.strictEqual(employerDisplayName({ businessName: "   " }, { fullName: "Rahul Patil" }), "Rahul Patil");
  assert.strictEqual(employerDisplayName({}, { fullName: "Rahul Patil" }), "Rahul Patil");
  // No name anywhere returns null - nothing is invented, and the caller decides
  // how to present "no name on record".
  assert.strictEqual(employerDisplayName({ businessName: null }, { fullName: null }), null);
  assert.strictEqual(employerDisplayName(null, null), null);
  assert.strictEqual(employerDisplayName(undefined), null);
});

test("workerDisplayName falls back from the profile to the account name", () => {
  assert.strictEqual(workerDisplayName({ fullName: "Sunita" }, { fullName: "S. Jadhav" }), "Sunita");
  assert.strictEqual(workerDisplayName({ fullName: "" }, { fullName: "S. Jadhav" }), "S. Jadhav");
  assert.strictEqual(workerDisplayName(null, null), null);
});

// =============================================================================
// THE SAME BOUNDARY, THE OTHER WAY ROUND
//
// Two further leaks found while auditing the worker-side boundary. Neither was
// displayed by any screen - the data was simply being shipped:
//
//   1. GET /applications/job/:jobId populated every applicant's
//      `workerId.userId.phone`, so an employer received the phone number of
//      workers who had merely applied, and of workers they had already rejected.
//   2. GET /ratings/user/:userId populated `fromUserId` with `phone`, publishing
//      the phone number of everyone who had rated someone to any authenticated
//      user who read their reviews.
// =============================================================================

import { getJobApplicants } from "../src/controllers/application.controller.js";
import { getUserRatings } from "../src/controllers/rating.controller.js";
import Rating from "../src/models/rating.model.js";

const APPLICANT_PHONE = "9876500099";

function mockApplicantList(t, statuses) {
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: EMPLOYER_PROFILE_ID })),
    mock.method(Job, "findOne", async () => ({ _id: JOB_ID, employerId: EMPLOYER_PROFILE_ID })),
    mock.method(Application, "find", () => ({
      populate: () => ({
        sort: async () =>
          statuses.map((status, index) => ({
            _id: `APP${index}`,
            status,
            // toObject is what a real Mongoose document provides; redaction must
            // work on the copy, never mutate the loaded document.
            toObject() {
              return {
                _id: this._id,
                status: this.status,
                workerId: {
                  _id: `WP${index}`,
                  fullName: `Worker ${index}`,
                  ratingAvg: 4,
                  userId: { _id: `U${index}`, phone: APPLICANT_PHONE, avatar: null },
                },
              };
            },
          })),
      }),
    })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
}

test("applicant list: phone is WITHHELD for every pre-hire status", async (t) => {
  const statuses = ["applied", "invited", "shortlisted", "rejected", "declined", "withdrawn"];
  mockApplicantList(t, statuses);

  const { req, res, next, done } = fakeReqRes({ user: { _id: "EMP_USER" }, params: { jobId: JOB_ID } });
  req.query = {};
  getJobApplicants(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.body.data.length, statuses.length);
  for (const [index, row] of res.body.data.entries()) {
    assert.strictEqual(
      row.workerId.userId.phone,
      undefined,
      `phone leaked for an applicant whose status is "${statuses[index]}"`
    );
    // Everything the employer needs in order to CHOOSE is still there.
    assert.strictEqual(row.workerId.fullName, `Worker ${index}`);
    assert.strictEqual(row.workerId.ratingAvg, 4);
  }
});

test("applicant list: phone IS released for an accepted or completed hire", async (t) => {
  mockApplicantList(t, ["accepted", "completed"]);

  const { req, res, next, done } = fakeReqRes({ user: { _id: "EMP_USER" }, params: { jobId: JOB_ID } });
  req.query = {};
  getJobApplicants(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  for (const row of res.body.data) {
    assert.strictEqual(row.workerId.userId.phone, APPLICANT_PHONE, `phone must be available for ${row.status}`);
  }
});

test("applicant list: a mixed list redacts per row, not all-or-nothing", async (t) => {
  mockApplicantList(t, ["applied", "accepted", "rejected"]);

  const { req, res, next, done } = fakeReqRes({ user: { _id: "EMP_USER" }, params: { jobId: JOB_ID } });
  req.query = {};
  getJobApplicants(req, res, next);
  await done;

  const [applied, accepted, rejected] = res.body.data;
  assert.strictEqual(applied.workerId.userId.phone, undefined);
  assert.strictEqual(accepted.workerId.userId.phone, APPLICANT_PHONE);
  assert.strictEqual(rejected.workerId.userId.phone, undefined);
});

test("rating list: a reviewer's phone number is never published", async (t) => {
  let capturedSelect = null;
  const findMock = mock.method(Rating, "find", () => ({
    populate: (path, select) => {
      capturedSelect = select;
      return { sort: async () => [] };
    },
  }));
  t.after(() => findMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({ user: { _id: WORKER_USER }, params: { userId: "ANY_USER" } });
  getUserRatings(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.ok(
    !capturedSelect.includes("phone"),
    `GET /ratings/user/:userId is readable by any authenticated user; it published reviewers' phone numbers (select was "${capturedSelect}")`
  );
});
