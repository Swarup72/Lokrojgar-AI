import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

process.env.AI_SERVICE_URL = "http://test-ai:9000";
// verifyRazorpaySignature() returns true when no secret is configured
// (its documented dev fallback) - pinned so the verify flow is deterministic.
delete process.env.RAZORPAY_KEY_SECRET;

import Notification from "../src/models/notification.model.js";
import DeviceToken from "../src/models/deviceToken.model.js";
import Application from "../src/models/application.model.js";
import Job from "../src/models/job.model.js";
import Payment from "../src/models/payment.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import { applyForJob, acceptOrRejectApplication } from "../src/controllers/application.controller.js";
import { recordCashOrUPI, verifyRazorpayPaymentEndpoint } from "../src/controllers/payment.controller.js";
import { inviteWorker } from "../src/controllers/application.controller.js";

// The Notification schema enum is the contract under test. Controllers used
// to send SCREAMING_CASE values that are not in it; sendNotificationService
// catches and logs the resulting ValidationError, so the HTTP request still
// succeeded while the notification was silently never persisted. These tests
// therefore assert on what reached Notification.create, not on status codes.
const SCHEMA_ENUM = Notification.schema.path("type").enumValues;

// Real ObjectIds: Notification casts userId/refId, so a placeholder string
// would fail validation for reasons unrelated to the enum.
const EMPLOYER_USER_ID = "507f1f77bcf86cd799439011";
const WORKER_USER_ID = "507f1f77bcf86cd799439012";
const PAYEE_USER_ID = "507f1f77bcf86cd799439013";
const APPLICATION_ID = "507f1f77bcf86cd799439021";
const PAYMENT_ID = "507f1f77bcf86cd799439022";
const JOB_ID = "507f1f77bcf86cd799439031";
const WORKER_PROFILE_ID = "507f1f77bcf86cd799439041";
const EMPLOYER_PROFILE_ID = "507f1f77bcf86cd799439042";

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
  const next = (err) => settle({ error: err || new Error("next() called with no error") });
  return { req, res, next, done };
}

/**
 * Replaces Notification.create with a stub that runs the SAME Mongoose
 * validation the real database enforces, instead of a permissive stub that
 * accepts anything. An invalid enum value is recorded as a rejection and
 * thrown, exactly as it behaved against the live database.
 */
function captureNotifications(t) {
  const persisted = [];
  const rejected = [];

  const createMock = mock.method(Notification, "create", async (doc) => {
    const candidate = new Notification(doc);
    const validationError = candidate.validateSync();
    if (validationError) {
      rejected.push({ type: doc.type, message: validationError.message });
      throw validationError;
    }
    persisted.push(candidate);
    return candidate;
  });
  const deviceTokenMock = mock.method(DeviceToken, "find", async () => []);

  t.after(() => {
    createMock.mock.restore();
    deviceTokenMock.mock.restore();
  });

  return { persisted, rejected };
}

function assertPersisted({ persisted, rejected }, expectedType) {
  assert.deepStrictEqual(rejected, [], "no notification may be rejected by schema validation");
  assert.strictEqual(persisted.length, 1, "exactly one notification should be persisted");
  const notification = persisted[0];
  assert.strictEqual(notification.type, expectedType);
  assert.ok(SCHEMA_ENUM.includes(notification.type), `${notification.type} must be a valid schema enum value`);
  assert.strictEqual(notification.validateSync(), undefined, "the persisted document must be valid");
  return notification;
}

// --- Schema contract --------------------------------------------------------

test("the Notification schema enum is the six documented lowercase values", () => {
  assert.deepStrictEqual(SCHEMA_ENUM, [
    "job_alert",
    "application_update",
    "payment_update",
    "system",
    "dispute",
    "chat",
  ]);
});

for (const invalid of ["JOB_APPLICATION", "APPLICATION_ACCEPTED", "PAYMENT_RECEIVED", "JOB_OFFER"]) {
  test(`the previously-sent type ${invalid} is rejected by the schema (proving the bug was real)`, () => {
    const error = new Notification({ userId: WORKER_USER_ID, type: invalid }).validateSync();
    assert.ok(error, `${invalid} must fail validation`);
    assert.match(error.message, /is not a valid enum value for path `type`/);
  });
}

for (const valid of ["job_alert", "application_update", "payment_update"]) {
  test(`the replacement type ${valid} passes schema validation`, () => {
    assert.strictEqual(new Notification({ userId: WORKER_USER_ID, type: valid }).validateSync(), undefined);
  });
}

// --- 1. Job application notifies the employer -------------------------------

test("applyForJob persists an application_update notification to the employer", async (t) => {
  const capture = captureNotifications(t);
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => ({
      _id: WORKER_PROFILE_ID,
      userId: WORKER_USER_ID,
      fullName: "Test Worker",
    })),
    mock.method(Job, "findById", async () => ({
      _id: JOB_ID,
      status: "open",
      employerId: EMPLOYER_PROFILE_ID,
      title: { en: "Plumber needed" },
    })),
    mock.method(WorkerSkill, "find", async () => []),
    mock.method(Application, "findOne", async () => null),
    mock.method(Application, "create", async (doc) => ({ _id: APPLICATION_ID, ...doc })),
    mock.method(EmployerProfile, "findById", async () => ({
      _id: EMPLOYER_PROFILE_ID,
      userId: EMPLOYER_USER_ID,
    })),
  ];
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      worker_id: WORKER_PROFILE_ID,
      job_id: JOB_ID,
      ranking: { overall_score: 75, match_factors: { skill: 80 } },
      explanation: {},
    }),
  });
  t.after(() => {
    mocks.forEach((m) => m.mock.restore());
    global.fetch = originalFetch;
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER_ID },
    body: { jobId: JOB_ID },
  });
  applyForJob(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);

  const notification = assertPersisted(capture, "application_update");
  assert.strictEqual(notification.userId.toString(), EMPLOYER_USER_ID);
  assert.strictEqual(notification.refId.toString(), APPLICATION_ID);
  // Message content is built from the NEW_MESSAGE template and must be unchanged.
  assert.match(notification.body.en, /New application for job Plumber needed with match score 75%/);
  assert.strictEqual(notification.data.senderName, "Test Worker");
});

// --- 2. Acceptance notifies the worker --------------------------------------

test("accepting an application persists an application_update notification to the worker", async (t) => {
  const capture = captureNotifications(t);
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: EMPLOYER_PROFILE_ID })),
    mock.method(Application, "findById", () => ({
      populate: async () => ({
        _id: APPLICATION_ID,
        status: "applied",
        workerId: { _id: WORKER_PROFILE_ID, userId: WORKER_USER_ID },
        jobId: { _id: JOB_ID, employerId: EMPLOYER_PROFILE_ID, title: { en: "Plumber needed" } },
      }),
    })),
    mock.method(Application, "findOneAndUpdate", async () => ({ _id: APPLICATION_ID, status: "accepted" })),
    mock.method(Job, "findOneAndUpdate", async () => ({ _id: JOB_ID, title: { en: "Plumber needed" } })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_ID },
    body: { status: "accepted" },
    params: { applicationId: APPLICATION_ID },
  });
  acceptOrRejectApplication(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  const notification = assertPersisted(capture, "application_update");
  assert.strictEqual(notification.userId.toString(), WORKER_USER_ID);
  assert.match(notification.body.en, /Plumber needed/);
});

// --- 3 & 4. Payments notify the payee ---------------------------------------

test("recordCashOrUPI persists a payment_update notification to the payee", async (t) => {
  const capture = captureNotifications(t);
  const paymentCreateMock = mock.method(Payment, "create", async (doc) => ({ _id: PAYMENT_ID, ...doc }));
  t.after(() => paymentCreateMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_ID },
    body: { jobId: JOB_ID, payeeId: PAYEE_USER_ID, amount: 900, paymentMethod: "cash" },
  });
  recordCashOrUPI(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  const notification = assertPersisted(capture, "payment_update");
  assert.strictEqual(notification.userId.toString(), PAYEE_USER_ID);
  assert.strictEqual(notification.data.amount, 900);
});

test("verifying a Razorpay payment persists a payment_update notification to the payee", async (t) => {
  const capture = captureNotifications(t);
  const paymentUpdateMock = mock.method(Payment, "findByIdAndUpdate", async () => ({
    _id: PAYMENT_ID,
    payeeId: PAYEE_USER_ID,
    amount: 1500,
  }));
  t.after(() => paymentUpdateMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_ID },
    body: {
      razorpay_order_id: "order_test",
      razorpay_payment_id: "pay_test",
      razorpay_signature: "sig_test",
      paymentId: PAYMENT_ID,
    },
  });
  verifyRazorpayPaymentEndpoint(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  const notification = assertPersisted(capture, "payment_update");
  assert.strictEqual(notification.userId.toString(), PAYEE_USER_ID);
  assert.strictEqual(notification.data.amount, 1500);
});

// --- 5. An employer's job request notifies the worker -----------------------
//
// This replaces the identical assertion that used to cover sendOffer(). The
// /offers path is retired (it bypassed the capacity reservation and over-hired
// jobs); employer-initiated hiring is now POST /applications/invite. The
// notification contract is unchanged: the invited worker gets a job_alert
// carrying the application id and the pay actually offered.

test("inviteWorker persists a job_alert notification to the invited worker", async (t) => {
  const capture = captureNotifications(t);
  const originalFetch = global.fetch;
  // Invitations carry a REAL AI match score rather than the hardcoded 100 the
  // retired /offers path invented, so the scoring call has to be answered.
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      worker_id: WORKER_PROFILE_ID,
      job_id: JOB_ID,
      ranking: {
        overall_score: 72,
        match_factors: { skill: 80, location: 70, availability: 100, pay: null, rating: null, relevance: 50 },
      },
      explanation: {},
    }),
  });
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: EMPLOYER_PROFILE_ID })),
    mock.method(EmployerProfile, "findById", async () => ({ _id: EMPLOYER_PROFILE_ID, userId: EMPLOYER_USER_ID })),
    mock.method(Job, "findOne", async () => ({
      _id: JOB_ID,
      employerId: EMPLOYER_PROFILE_ID,
      status: "open",
      requiredWorkers: 2,
      filledWorkers: 0,
      title: { en: "Plumber needed" },
      payAmount: 800,
      payType: "daily",
    })),
    mock.method(WorkerProfile, "findById", async () => ({
      _id: WORKER_PROFILE_ID,
      userId: WORKER_USER_ID,
    })),
    mock.method(WorkerSkill, "find", async () => []),
    mock.method(Application, "findOne", async () => null),
    mock.method(Application, "create", async (doc) => ({ _id: APPLICATION_ID, ...doc })),
  ];
  t.after(() => {
    mocks.forEach((m) => m.mock.restore());
    global.fetch = originalFetch;
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_ID },
    body: { jobId: JOB_ID, workerId: WORKER_PROFILE_ID, proposedPay: 850 },
  });
  inviteWorker(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  const notification = assertPersisted(capture, "job_alert");
  assert.strictEqual(notification.userId.toString(), WORKER_USER_ID);
  assert.strictEqual(notification.refId.toString(), APPLICATION_ID);
  assert.strictEqual(notification.data.payAmount, 850);
  // The match score must be the AI service's, not an invented constant.
  assert.strictEqual(res.body.data.matchScore, 72);
  assert.strictEqual(res.body.data.status, "invited");
  assert.strictEqual(res.body.data.initiatedBy, "employer");
});

// --- Guard: no controller may reintroduce an invalid type -------------------

test("every notification type sent by a controller is a valid schema enum value", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = new URL("../src/controllers/", import.meta.url);
  const files = await readdir(dir);
  const offenders = [];

  for (const file of files.filter((f) => f.endsWith(".js"))) {
    const source = await readFile(new URL(file, dir), "utf8");
    // Only the `type:` of a sendNotificationService({...}) call, not
    // templateKey and not GeoJSON `type: "Point"`.
    for (const block of source.split("sendNotificationService({").slice(1)) {
      const match = block.slice(0, 400).match(/\btype:\s*"([^"]+)"/);
      if (match && !SCHEMA_ENUM.includes(match[1])) {
        offenders.push(`${file}: ${match[1]}`);
      }
    }
  }

  assert.deepStrictEqual(offenders, [], "controllers must only send schema-valid notification types");
});
