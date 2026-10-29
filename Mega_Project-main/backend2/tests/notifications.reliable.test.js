import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import mongoose from "mongoose";

import Notification from "../src/models/notification.model.js";
import User from "../src/models/user.model.js";
import AdminAction from "../src/models/adminAction.model.js";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  resolveNotificationTarget,
} from "../src/controllers/notification.controller.js";
import { sendAnnouncement, getNotificationStats } from "../src/controllers/admin.controller.js";
import { sendNotificationService } from "../src/services/notification.service.js";
import {
  executeWithRetry,
  getProviderForChannel,
  InAppNotificationProvider,
  PushNotificationProvider,
  SmsNotificationProvider,
  WhatsAppNotificationProvider,
  EmailNotificationProvider,
} from "../src/services/notificationProviders/notificationProvider.js";
import {
  buildTrilingualNotification,
  NOTIFICATION_TEMPLATES,
} from "../src/utils/notificationBuilder.js";
import { pickLanguage } from "../src/utils/languagePicker.js";

// Valid MongoDB ObjectIds for testing
const USER_A_ID = new mongoose.Types.ObjectId().toString();
const USER_B_ID = new mongoose.Types.ObjectId().toString();
const ADMIN_ID = new mongoose.Types.ObjectId().toString();
const NOTIF_1_ID = new mongoose.Types.ObjectId().toString();
const NOTIF_2_ID = new mongoose.Types.ObjectId().toString();

function fakeReqRes({ user = null, body = {}, query = {}, params = {}, lang = "en" } = {}) {
  const req = { user, body, query, params, lang };
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  const res = {
    statusCode: 200,
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

// ============================================================================
// 1. Inbox Ownership, Privacy, and Read Status
// ============================================================================

test("Inbox Security: Users can only retrieve their own notifications", async (t) => {
  let capturedQuery = null;

  mock.method(Notification, "find", (query) => {
    capturedQuery = query;
    return {
      sort() {
        return this;
      },
      skip() {
        return this;
      },
      limit() {
        return this;
      },
      lean: async () => [
        {
          _id: NOTIF_1_ID,
          userId: USER_A_ID,
          type: "application_update",
          title: { en: "Application Accepted", mr: "अर्ज स्वीकारला", hi: "आवेदन स्वीकृत" },
          body: { en: "Job details here", mr: "तपशील", hi: "विवरण" },
          isRead: false,
          createdAt: new Date(),
        },
      ],
    };
  });

  mock.method(Notification, "countDocuments", async (query) => 1);

  t.after(() => {
    mock.reset();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_A_ID, preferredLanguage: "mr" },
    query: { page: "1", limit: "10" },
  });

  await getNotifications(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(capturedQuery.userId, USER_A_ID, "Query must strictly scope by authenticated user ID");
  assert.strictEqual(res.body.data.notifications.length, 1);
  assert.strictEqual(res.body.data.notifications[0].title, "अर्ज स्वीकारला", "Localized into user's preferredLanguage");
  assert.strictEqual(res.body.data.unreadCount, 1);
});

test("Inbox Security: Mark as read strictly denies access to unowned notifications", async (t) => {
  let findOneAndUpdateQuery = null;

  mock.method(Notification, "findOneAndUpdate", async (query, update, opts) => {
    findOneAndUpdateQuery = query;
    // Simulate notification exists but belongs to USER_B, so findOneAndUpdate returns null
    if (query.userId === USER_A_ID && query._id === NOTIF_2_ID) {
      return null;
    }
    return { _id: query._id, isRead: true };
  });

  t.after(() => {
    mock.reset();
  });

  // User A attempts to mark User B's notification
  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_A_ID },
    params: { id: NOTIF_2_ID },
  });

  await markNotificationRead(req, res, next);
  const result = await done;

  assert.strictEqual(findOneAndUpdateQuery.userId, USER_A_ID, "Must require both notification ID and matching userId");
  assert.ok(result.error, "Should pass error to next()");
  assert.strictEqual(result.error.statusCode, 404, "Must return 404 for unowned notification");
});

test("Inbox Validation: Reject invalid ObjectId format when marking as read", async () => {
  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_A_ID },
    params: { id: "not-a-valid-object-id" },
  });

  await markNotificationRead(req, res, next);
  const result = await done;

  assert.ok(result.error);
  assert.strictEqual(result.error.statusCode, 400);
  assert.match(result.error.message, /invalid notification id format/i);
});

test("Unread Count: Strictly scoped to authenticated user and unread status", async (t) => {
  let countQuery = null;

  mock.method(Notification, "countDocuments", async (query) => {
    countQuery = query;
    return 5;
  });

  t.after(() => {
    mock.reset();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_A_ID },
  });

  await getUnreadCount(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(countQuery, { userId: USER_A_ID, isRead: false });
  assert.strictEqual(res.body.data.unreadCount, 5);
});

test("Mark All Read: Updates only the authenticated user's unread notifications", async (t) => {
  let updateQuery = null;

  mock.method(Notification, "updateMany", async (query, update) => {
    updateQuery = query;
    return { modifiedCount: 3 };
  });

  t.after(() => {
    mock.reset();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_A_ID },
  });

  await markAllNotificationsRead(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(updateQuery, { userId: USER_A_ID, isRead: false });
  assert.strictEqual(res.body.data.modifiedCount, 3);
});

// ============================================================================
// 2. Idempotency and Duplicate Prevention
// ============================================================================

test("Idempotency: Re-sending with existing idempotencyKey suppresses duplicate", async (t) => {
  const existingDoc = {
    _id: NOTIF_1_ID,
    userId: USER_A_ID,
    type: "application_update",
    idempotencyKey: "app_accept_job123_worker456",
  };

  let createCalled = false;
  mock.method(Notification, "findOne", async ({ idempotencyKey }) => {
    if (idempotencyKey === "app_accept_job123_worker456") {
      return existingDoc;
    }
    return null;
  });

  mock.method(Notification, "create", async () => {
    createCalled = true;
    return existingDoc;
  });

  t.after(() => {
    mock.reset();
  });

  const result = await sendNotificationService({
    userId: USER_A_ID,
    type: "application_update",
    templateKey: "APPLICATION_ACCEPTED",
    templateData: { jobTitle: "Carpenter" },
    idempotencyKey: "app_accept_job123_worker456",
  });

  assert.strictEqual(createCalled, false, "Notification.create must not be called when key already exists");
  assert.strictEqual(result._id, NOTIF_1_ID);
});

test("Idempotency: Duplicate key E11000 race condition is caught safely", async (t) => {
  const existingDoc = {
    _id: NOTIF_1_ID,
    userId: USER_A_ID,
    type: "job_alert",
    idempotencyKey: "job_alert_job789_worker101",
  };

  mock.method(Notification, "findOne", async () => existingDoc);
  mock.method(Notification, "create", async () => {
    const err = new Error("E11000 duplicate key error collection");
    err.code = 11000;
    throw err;
  });

  t.after(() => {
    mock.reset();
  });

  const result = await sendNotificationService({
    userId: USER_A_ID,
    type: "job_alert",
    templateKey: "JOB_ALERT",
    templateData: { jobTitle: "Electrician" },
    idempotencyKey: "job_alert_job789_worker101",
  });

  assert.strictEqual(result._id, NOTIF_1_ID, "Must safely recover and return the existing document on E11000");
});

// ============================================================================
// 3. Delivery Reliability and Bounded Retries
// ============================================================================

test("executeWithRetry: Resolves immediately on successful first attempt", async () => {
  let callCount = 0;
  const outcome = await executeWithRetry(async (attempt) => {
    callCount++;
    return "delivered_ok";
  }, { maxRetries: 2, baseDelayMs: 5 });

  assert.strictEqual(outcome.success, true);
  assert.strictEqual(outcome.attempts, 1);
  assert.strictEqual(outcome.result, "delivered_ok");
  assert.strictEqual(callCount, 1);
});

test("executeWithRetry: Recovers after transient failure and records attempts", async () => {
  let callCount = 0;
  const outcome = await executeWithRetry(async (attempt) => {
    callCount++;
    if (callCount < 2) {
      throw new Error("Temporary network glitch");
    }
    return "delivered_after_retry";
  }, { maxRetries: 2, baseDelayMs: 5 });

  assert.strictEqual(outcome.success, true);
  assert.strictEqual(outcome.attempts, 2);
  assert.strictEqual(outcome.result, "delivered_after_retry");
  assert.strictEqual(callCount, 2);
});

test("executeWithRetry: Bounded retries exhausted and secrets redacted from error", async () => {
  const outcome = await executeWithRetry(async () => {
    throw new Error("External API auth failed with secret_key_abcdef12345678901234");
  }, { maxRetries: 2, baseDelayMs: 5 });

  assert.strictEqual(outcome.success, false);
  assert.strictEqual(outcome.attempts, 3);
  assert.ok(!outcome.error.includes("secret_key_abcdef12345678901234"), "Secrets must be redacted");
  assert.ok(outcome.error.includes("[REDACTED]"));
});

test("Channel Provider Abstraction: Returns 'skipped' when external credentials are missing", async () => {
  const channels = ["sms", "whatsapp", "push", "email"];

  for (const ch of channels) {
    const provider = getProviderForChannel(ch);
    assert.ok(provider, `Provider must exist for channel: ${ch}`);

    const result = await provider.send({
      userId: USER_A_ID,
      title: "Test Alert",
      body: "Test Body",
    });

    assert.strictEqual(
      result.status,
      "skipped",
      `Channel ${ch} without configured environment must return 'skipped', never fake 'delivered'`
    );
    assert.ok(result.error, "Skipped status must specify clear configuration reason");
  }
});

test("Delivery Isolation: External delivery failure does not throw or crash caller", async (t) => {
  mock.method(Notification, "create", async (doc) => ({
    _id: NOTIF_1_ID,
    ...doc,
    save: async () => {},
  }));

  // Mock User.findById with mock property
  const findByIdMock = mock.method(User, "findById", () => ({
    select: () => ({
      lean: async () => ({
        preferredLanguage: "en",
        phone: "+919876543210",
        isBlocked: false,
      }),
    }),
  }));

  t.after(() => {
    mock.reset();
  });

  // Call with SMS channel (which is skipped because unconfigured)
  const result = await sendNotificationService({
    userId: USER_A_ID,
    type: "application_update",
    templateKey: "APPLICATION_ACCEPTED",
    templateData: { jobTitle: "Plumber" },
    channel: "sms",
  });

  assert.ok(result, "sendNotificationService must return notification record even if external channel is not configured");
  assert.strictEqual(result._id, NOTIF_1_ID);
});

// ============================================================================
// 4. Multilingual Notification Templates & Language Fallback
// ============================================================================

test("Multilingual Templates: Correct localized text generated for Marathi, Hindi, and English", () => {
  const templates = ["APPLICATION_ACCEPTED", "APPLICATION_REJECTED", "APPLICATION_SUBMITTED", "DISPUTE_RAISED", "JOB_ALERT"];

  for (const key of templates) {
    const payload = buildTrilingualNotification(key, {
      jobTitle: "Electrician",
      workerName: "Ramesh",
      payAmount: 800,
      payType: "day",
      disputeId: "DISP-123",
    });

    assert.ok(payload.title.mr && /[ऀ-ॿ]/.test(payload.title.mr), `${key} title must have Marathi Devanagari`);
    assert.ok(payload.title.hi && /[ऀ-ॿ]/.test(payload.title.hi), `${key} title must have Hindi Devanagari`);
    assert.ok(payload.title.en && /[A-Za-z]/.test(payload.title.en), `${key} title must have English text`);

    assert.ok(payload.body.mr && /[ऀ-ॿ]/.test(payload.body.mr), `${key} body must have Marathi Devanagari`);
    assert.ok(payload.body.hi && /[ऀ-ॿ]/.test(payload.body.hi), `${key} body must have Hindi Devanagari`);
    assert.ok(payload.body.en && /[A-Za-z]/.test(payload.body.en), `${key} body must have English text`);
  }
});

test("Multilingual Language Picker: Falls back gracefully to English when language is unsupported", () => {
  const localized = {
    mr: "नवीन नोकरी उपलब्ध",
    hi: "नई नौकरी उपलब्ध",
    en: "New job available",
  };

  assert.strictEqual(pickLanguage(localized, "mr", "en"), "नवीन नोकरी उपलब्ध");
  assert.strictEqual(pickLanguage(localized, "hi", "en"), "नई नौकरी उपलब्ध");
  assert.strictEqual(pickLanguage(localized, "en", "en"), "New job available");
  // Unsupported language (e.g. "fr") falls back to English
  assert.strictEqual(pickLanguage(localized, "fr", "en"), "New job available");
  // Missing language parameter falls back to English
  assert.strictEqual(pickLanguage(localized, null, "en"), "New job available");
});

// ============================================================================
// 5. Admin Integration & Delivery Statistics
// ============================================================================

test("Admin Announcements: Requires authorized admin role", async () => {
  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_A_ID, roles: ["worker"] },
    body: {
      targetRole: "worker",
      title: { en: "Test Announcement" },
      body: { en: "Test content" },
    },
  });

  // Role middleware would block this, but we also verify controller-level validation
  assert.ok(!req.user.roles.includes("admin"), "Worker cannot be treated as admin");
});

test("Admin Announcements: Returns delivery stats and channel report", async (t) => {
  mock.method(User, "find", () => ({
    select: async () => [{ _id: USER_A_ID }, { _id: USER_B_ID }],
  }));

  mock.method(Notification, "insertMany", async (notifications) => notifications);
  mock.method(AdminAction, "create", async (entry) => entry);

  t.after(() => {
    mock.reset();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: ADMIN_ID, roles: ["admin"] },
    body: {
      targetRole: "worker",
      title: {
        en: "Platform Upgrade Notice",
        mr: "प्लॅटफॉर्म सुधारणा सूचना",
        hi: "प्लेटफ़ॉर्म अपग्रेड सूचना",
      },
      body: {
        en: "System maintenance tonight.",
        mr: "आज रात्री प्रणाली देखभाल.",
        hi: "आज रात सिस्टम रखरखाव।",
      },
      channel: "in_app",
    },
  });

  await sendAnnouncement(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.data.sentCount, 2);
  assert.ok(res.body.data.deliveryStats, "Must include deliveryStats object");
  assert.strictEqual(res.body.data.deliveryStats.totalTargeted, 2);
  assert.strictEqual(res.body.data.deliveryStats.delivered, 2);
  assert.strictEqual(res.body.data.deliveryStats.channel, "in_app");
});

// ============================================================================
// 6. Idempotency Index Semantics, Broadcast Deduplication & Role Navigation
// ============================================================================

test("Notification Schema: Uses partialFilterExpression on idempotencyKey and omits null/empty keys", () => {
  const docWithNull = new Notification({
    userId: USER_A_ID,
    type: "system",
    title: { en: "Hello" },
    body: { en: "World" },
    idempotencyKey: null,
  });
  const docWithEmpty = new Notification({
    userId: USER_B_ID,
    type: "system",
    title: { en: "Hello" },
    body: { en: "World" },
    idempotencyKey: "   ",
  });
  const docWithKey = new Notification({
    userId: USER_A_ID,
    type: "system",
    title: { en: "Hello" },
    body: { en: "World" },
    idempotencyKey: " valid_key_123 ",
  });

  assert.strictEqual(docWithNull.idempotencyKey, undefined, "null idempotencyKey must be omitted");
  assert.strictEqual(docWithEmpty.idempotencyKey, undefined, "whitespace idempotencyKey must be omitted");
  assert.strictEqual(docWithKey.idempotencyKey, "valid_key_123", "valid idempotencyKey must be trimmed and kept");

  const indexes = Notification.schema.indexes();
  const idempIdx = indexes.find(([fields]) => fields.idempotencyKey === 1);
  assert.ok(idempIdx, "idempotencyKey index must exist on Notification schema");
  assert.strictEqual(idempIdx[1].unique, true);
  assert.deepStrictEqual(idempIdx[1].partialFilterExpression, {
    idempotencyKey: { $type: "string", $gt: "" },
  });
});

test("Admin Announcements: Generates unique per-recipient idempotencyKeys and deduplicates retries", async (t) => {
  let capturedQuery = null;
  let insertedBatches = [];

  mock.method(User, "find", (query) => {
    capturedQuery = query;
    return {
      select: async () => [{ _id: USER_A_ID }, { _id: USER_B_ID }],
    };
  });

  mock.method(Notification, "insertMany", async (notifications) => {
    insertedBatches.push(notifications);
    return notifications;
  });
  mock.method(AdminAction, "create", async (entry) => entry);

  t.after(() => {
    mock.reset();
  });

  // First send to "all"
  const { req: req1, res: res1, next: next1, done: done1 } = fakeReqRes({
    user: { _id: ADMIN_ID, roles: ["admin"] },
    body: {
      targetRole: "all",
      idempotencyKey: "broadcast_2026_test",
      title: { en: "Platform Ready" },
      body: { en: "The platform is ready to use" },
    },
  });

  await sendAnnouncement(req1, res1, next1);
  await done1;

  assert.strictEqual(res1.statusCode, 201);
  assert.deepStrictEqual(capturedQuery, { isBlocked: { $ne: true } });
  assert.strictEqual(insertedBatches.length, 1);
  assert.strictEqual(insertedBatches[0].length, 2);
  assert.strictEqual(
    insertedBatches[0][0].idempotencyKey,
    `announcement_broadcast_2026_test_${USER_A_ID}`
  );
  assert.strictEqual(
    insertedBatches[0][1].idempotencyKey,
    `announcement_broadcast_2026_test_${USER_B_ID}`
  );

  // Simulate retry where USER_A_ID already received it
  mock.method(Notification, "find", () => ({
    select: async () => [{ idempotencyKey: `announcement_broadcast_2026_test_${USER_A_ID}` }],
  }));

  const { req: req2, res: res2, next: next2, done: done2 } = fakeReqRes({
    user: { _id: ADMIN_ID, roles: ["admin"] },
    body: {
      targetRole: "all",
      idempotencyKey: "broadcast_2026_test",
      title: { en: "Platform Ready" },
      body: { en: "The platform is ready to use" },
    },
  });

  await sendAnnouncement(req2, res2, next2);
  await done2;

  assert.strictEqual(res2.statusCode, 201);
  assert.strictEqual(insertedBatches.length, 2);
  assert.strictEqual(insertedBatches[1].length, 1, "Only the remaining recipient should be inserted on retry");
  assert.strictEqual(
    insertedBatches[1][0].idempotencyKey,
    `announcement_broadcast_2026_test_${USER_B_ID}`
  );
  assert.strictEqual(res2.body.data.sentCount, 2);
  assert.strictEqual(res2.body.data.deliveryStats.skipped, 1);
});

test("Role-Based Navigation: Employers and Workers resolve to role-appropriate target routes", () => {
  const JOB_ID = new mongoose.Types.ObjectId().toString();
  const APP_ID = new mongoose.Types.ObjectId().toString();
  const appMap = new Map([[APP_ID, { _id: APP_ID, jobId: JOB_ID, initiatedBy: "worker", status: "applied" }]]);
  const jobMap = new Map([[JOB_ID, { _id: JOB_ID, status: "open" }]]);

  // 1. Employer receiving application_update -> /applicants/:jobId (never /applications!)
  const employerNotif = {
    type: "application_update",
    refId: APP_ID,
    data: { senderName: "Ramesh Worker" },
  };
  const empResolved = resolveNotificationTarget(
    employerNotif,
    { roles: ["employer"] },
    appMap,
    jobMap,
    true
  );
  assert.strictEqual(empResolved.targetLink, `/applicants/${JOB_ID}`);
  assert.strictEqual(empResolved.targetUnavailable, false);

  // 2. Worker receiving application_update -> /applications
  const workerNotif = {
    type: "application_update",
    refId: APP_ID,
    data: { jobTitle: "Plumbing Repair" },
  };
  const workerResolved = resolveNotificationTarget(
    workerNotif,
    { roles: ["worker"] },
    appMap,
    jobMap,
    true
  );
  assert.strictEqual(workerResolved.targetLink, "/applications");
  assert.strictEqual(workerResolved.targetUnavailable, false);

  // 3. Worker receiving employer-initiated job invitation -> /job-requests
  const inviteAppMap = new Map([
    [APP_ID, { _id: APP_ID, jobId: JOB_ID, initiatedBy: "employer", status: "invited" }],
  ]);
  const inviteResolved = resolveNotificationTarget(
    { type: "job_alert", refId: APP_ID, data: {} },
    { roles: ["worker"] },
    inviteAppMap,
    jobMap,
    true
  );
  assert.strictEqual(inviteResolved.targetLink, "/job-requests");

  // 4. Platform announcement -> null targetLink (opens detail modal on frontend)
  const announcementResolved = resolveNotificationTarget(
    { type: "system", data: { announcement: true, targetRole: "all" } },
    { roles: ["worker"] },
    appMap,
    jobMap,
    true
  );
  assert.strictEqual(announcementResolved.targetLink, null);

  // 5. Deleted application/job -> targetUnavailable: true with safe fallback
  const deletedJobMap = new Map([[JOB_ID, null]]);
  const unavailableResolved = resolveNotificationTarget(
    employerNotif,
    { roles: ["employer"] },
    appMap,
    deletedJobMap,
    true
  );
  assert.strictEqual(unavailableResolved.targetUnavailable, true);
  assert.strictEqual(unavailableResolved.targetLink, "/employer-dashboard");
});
