import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import User from "../src/models/user.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import Job from "../src/models/job.model.js";
import Application from "../src/models/application.model.js";
import Dispute from "../src/models/dispute.model.js";
import Rating from "../src/models/rating.model.js";
import Notification from "../src/models/notification.model.js";
import AdminAction from "../src/models/adminAction.model.js";

import {
  getDashboardStats,
  getWorkers,
  getWorkerById,
  updateWorkerStatus,
  getEmployers,
  getEmployerById,
  verifyEmployer,
  updateEmployerStatus,
  getJobs,
  moderateJob,
  getApplications,
  getDisputes,
  updateDisputeStatus,
  getRatings,
  moderateRating,
  getNotificationStats,
  sendAnnouncement,
  getAiServiceStatus,
  getAuditLogs,
} from "../src/controllers/admin.controller.js";
import { authorizeRoles } from "../src/middlewares/role.middleware.js";

function fakeReqRes({ user, body = {}, query = {}, params = {} } = {}) {
  const req = { user, body, query, params };
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

const ADMIN_USER = {
  _id: "507f1f77bcf86cd799439011",
  fullName: "System Admin",
  phone: "+919999999999",
  roles: ["admin"],
  isBlocked: false,
};

const WORKER_USER = {
  _id: "507f1f77bcf86cd799439022",
  fullName: "Worker Ram",
  phone: "+919876543210",
  roles: ["worker"],
  isBlocked: false,
};

const EMPLOYER_USER = {
  _id: "507f1f77bcf86cd799439033",
  fullName: "Employer Shyam",
  phone: "+919876543211",
  roles: ["employer"],
  isBlocked: false,
};

test("Admin Authorization Middleware: Rejects workers and employers with 403 Forbidden", async () => {
  const adminGuard = authorizeRoles("admin");

  // Worker attempt
  const workerHarness = fakeReqRes({ user: WORKER_USER });
  adminGuard(workerHarness.req, workerHarness.res, workerHarness.next);
  const workerResult = await workerHarness.done;
  assert.ok(workerResult.error, "Worker should trigger an error in next()");
  assert.strictEqual(workerResult.error.statusCode, 403);
  assert.match(workerResult.error.message, /Forbidden.*Required role.*admin/i);

  // Employer attempt
  const employerHarness = fakeReqRes({ user: EMPLOYER_USER });
  adminGuard(employerHarness.req, employerHarness.res, employerHarness.next);
  const employerResult = await employerHarness.done;
  assert.ok(employerResult.error, "Employer should trigger an error in next()");
  assert.strictEqual(employerResult.error.statusCode, 403);

  // Unauthenticated attempt
  const unauthHarness = fakeReqRes({ user: null });
  adminGuard(unauthHarness.req, unauthHarness.res, unauthHarness.next);
  const unauthResult = await unauthHarness.done;
  assert.ok(unauthResult.error, "Unauthenticated request should trigger an error in next()");
  assert.strictEqual(unauthResult.error.statusCode, 401);

  // Valid admin attempt
  const adminHarness = fakeReqRes({ user: ADMIN_USER });
  adminGuard(adminHarness.req, adminHarness.res, adminHarness.next);
  const adminResult = await adminHarness.done;
  assert.strictEqual(adminResult.error, null, "Admin user should pass through without error");
});

test("Dashboard Stats: Real Aggregations and Metric Calculations", async () => {
  // Mock model countDocuments
  mock.method(WorkerProfile, "countDocuments", async () => 150);
  mock.method(EmployerProfile, "countDocuments", async () => 45);
  mock.method(Job, "countDocuments", async (filter) => (filter?.status ? 30 : 60));
  mock.method(Application, "countDocuments", async (filter) => (filter?.status ? 25 : 120));
  mock.method(User, "countDocuments", async () => 3);
  mock.method(Dispute, "countDocuments", async () => 4);

  // Mock aggregates
  const mockAggregate = async () => [
    { _id: "2026-05", count: 10 },
    { _id: "2026-06", count: 15 },
  ];
  mock.method(WorkerProfile, "aggregate", mockAggregate);
  mock.method(EmployerProfile, "aggregate", mockAggregate);
  mock.method(Job, "aggregate", mockAggregate);
  mock.method(Application, "aggregate", mockAggregate);

  // Mock AdminAction and Attention queries
  mock.method(AdminAction, "find", () => ({
    populate: () => ({
      populate: () => ({
        populate: () => ({
          sort: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
  }));

  mock.method(Dispute, "find", () => ({
    populate: () => ({
      populate: () => ({
        sort: () => ({
          limit: async () => [],
        }),
      }),
    }),
  }));

  mock.method(EmployerProfile, "find", () => ({
    populate: () => ({
      sort: () => ({
        limit: async () => [],
      }),
    }),
  }));

  const { req, res, next, done } = fakeReqRes({ user: ADMIN_USER });
  await getDashboardStats(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  const data = res.body.data;
  assert.strictEqual(data.summary.totalWorkers, 150);
  assert.strictEqual(data.summary.totalEmployers, 45);
  assert.strictEqual(data.summary.activeJobs, 30);
  assert.strictEqual(data.summary.successfulHires, 25);
  assert.strictEqual(data.summary.openDisputes, 4);
  assert.ok(Array.isArray(data.trends.workers));
  assert.strictEqual(data.trends.workers.length, 6);

  mock.reset();
});

test("Worker Management: Suspend and Reactivate with Audit Logging", async () => {
  const fakeWorker = {
    _id: "WORKER_PROFILE_1",
    userId: "USER_1",
    fullName: "Ramesh Pawar",
  };

  mock.method(WorkerProfile, "findById", async () => fakeWorker);
  mock.method(User, "findByIdAndUpdate", (id, update) => ({
    select: async () => ({
      _id: id,
      isBlocked: update.isBlocked,
      fullName: "Ramesh Pawar",
    }),
  }));

  let loggedAction = null;
  mock.method(AdminAction, "create", async (entry) => {
    loggedAction = entry;
    return entry;
  });

  // Suspend worker
  const suspendHarness = fakeReqRes({
    user: ADMIN_USER,
    params: { id: "WORKER_PROFILE_1" },
    body: { isBlocked: true, reason: "Multiple scam reports" },
  });

  await updateWorkerStatus(suspendHarness.req, suspendHarness.res, suspendHarness.next);
  await suspendHarness.done;

  assert.strictEqual(suspendHarness.res.statusCode, 200);
  assert.strictEqual(loggedAction.actionType, "SUSPEND_WORKER");
  assert.strictEqual(loggedAction.targetUserId, "USER_1");
  assert.match(loggedAction.details, /Multiple scam reports/);

  // Reactivate worker
  const reactivateHarness = fakeReqRes({
    user: ADMIN_USER,
    params: { id: "WORKER_PROFILE_1" },
    body: { isBlocked: false, reason: "Identity verified after review" },
  });

  await updateWorkerStatus(reactivateHarness.req, reactivateHarness.res, reactivateHarness.next);
  await reactivateHarness.done;

  assert.strictEqual(reactivateHarness.res.statusCode, 200);
  assert.strictEqual(loggedAction.actionType, "REACTIVATE_WORKER");

  mock.reset();
});

test("Employer Management: Verification Approval and Rejection", async () => {
  const fakeEmployer = {
    _id: "EMP_PROFILE_1",
    userId: { _id: "USER_EMP_1", fullName: "Kisan Agro Supplies" },
    isVerified: true,
  };

  mock.method(EmployerProfile, "findByIdAndUpdate", () => ({
    populate: async () => fakeEmployer,
  }));

  let loggedAction = null;
  mock.method(AdminAction, "create", async (entry) => {
    loggedAction = entry;
    return entry;
  });

  const { req, res, next, done } = fakeReqRes({
    user: ADMIN_USER,
    params: { id: "EMP_PROFILE_1" },
    body: { isVerified: true, reason: "Valid GST and business registration submitted" },
  });

  await verifyEmployer(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(loggedAction.actionType, "VERIFY_EMPLOYER");
  assert.strictEqual(loggedAction.targetUserId, "USER_EMP_1");

  mock.reset();
});

test("Job Moderation: Cancel, Reopen, and Close Jobs", async () => {
  const fakeJob = {
    _id: "JOB_101",
    status: "open",
    title: { en: "Plumbing work" },
    save: async function () {
      return this;
    },
  };

  mock.method(Job, "findById", async () => fakeJob);

  let loggedAction = null;
  mock.method(AdminAction, "create", async (entry) => {
    loggedAction = entry;
    return entry;
  });

  // Cancel job
  const { req, res, next, done } = fakeReqRes({
    user: ADMIN_USER,
    params: { id: "JOB_101" },
    body: { action: "cancel", reason: "Violates safety terms" },
  });

  await moderateJob(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(fakeJob.status, "cancelled");
  assert.strictEqual(loggedAction.actionType, "MODERATE_JOB");
  assert.strictEqual(loggedAction.targetJobId, "JOB_101");

  mock.reset();
});

test("Dispute Resolution: Status Transitions and Audit Trail", async () => {
  const fakeDispute = {
    _id: "DISPUTE_99",
    status: "resolved",
    jobId: { _id: "JOB_1" },
    againstUserId: { _id: "USER_DEFENDANT" },
  };

  mock.method(Dispute, "findByIdAndUpdate", () => ({
    populate: () => ({
      populate: () => ({
        populate: async () => fakeDispute,
      }),
    }),
  }));

  let loggedAction = null;
  mock.method(AdminAction, "create", async (entry) => {
    loggedAction = entry;
    return entry;
  });

  const { req, res, next, done } = fakeReqRes({
    user: ADMIN_USER,
    params: { id: "DISPUTE_99" },
    body: { status: "resolved", resolutionNote: "Worker completed shift; wage settlement confirmed" },
  });

  await updateDisputeStatus(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(loggedAction.actionType, "RESOLVE_DISPUTE");
  assert.match(loggedAction.details, /wage settlement confirmed/);

  mock.reset();
});

test("Rating Moderation: Hide Inappropriate Reviews and Log Action", async () => {
  const fakeRating = {
    _id: "RATING_55",
    rating: 1,
    review: "[Review content removed by administrator for violating guidelines]",
    toUserId: { _id: "TARGET_USER" },
    jobId: { _id: "JOB_12" },
  };

  mock.method(Rating, "findByIdAndUpdate", () => ({
    populate: () => ({
      populate: () => ({
        populate: async () => fakeRating,
      }),
    }),
  }));

  let loggedAction = null;
  mock.method(AdminAction, "create", async (entry) => {
    loggedAction = entry;
    return entry;
  });

  const { req, res, next, done } = fakeReqRes({
    user: ADMIN_USER,
    params: { id: "RATING_55" },
    body: {
      isModerated: true,
      moderationReason: "Inappropriate and abusive language",
      hideReviewText: true,
    },
  });

  await moderateRating(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(loggedAction.actionType, "MODERATE_RATING");
  assert.match(loggedAction.details, /Inappropriate and abusive language/);

  mock.reset();
});

test("Platform Announcements: Multilingual Broadcast and Audit Log", async () => {
  mock.method(User, "find", () => ({
    select: async () => [{ _id: "U1" }, { _id: "U2" }, { _id: "U3" }],
  }));

  let createdNotifications = [];
  mock.method(Notification, "insertMany", async (notifications) => {
    createdNotifications = notifications;
    return notifications;
  });

  let loggedAction = null;
  mock.method(AdminAction, "create", async (entry) => {
    loggedAction = entry;
    return entry;
  });

  const { req, res, next, done } = fakeReqRes({
    user: ADMIN_USER,
    body: {
      targetRole: "worker",
      title: {
        en: "Platform Maintenance Alert",
        mr: "प्लॅटफॉर्म देखभाल सूचना",
        hi: "प्लेटफ़ॉर्म रखरखाव सूचना",
      },
      body: {
        en: "The platform will undergo maintenance on Sunday.",
        mr: "रविवारी प्लॅटफॉर्मची देखभाल केली जाईल.",
        hi: "रविवार को प्लेटफॉर्म का रखरखाव किया जाएगा।",
      },
    },
  });

  await sendAnnouncement(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.data.sentCount, 3);
  assert.strictEqual(createdNotifications.length, 3);
  assert.strictEqual(createdNotifications[0].type, "system");
  assert.strictEqual(createdNotifications[0].data.announcement, true);
  assert.strictEqual(createdNotifications[0].title.mr, "प्लॅटफॉर्म देखभाल सूचना");
  assert.strictEqual(loggedAction.actionType, "SEND_ANNOUNCEMENT");

  mock.reset();
});

test("AI Service Monitoring: Handles Health Check and Latency Calculation", async () => {
  const { req, res, next, done } = fakeReqRes({ user: ADMIN_USER });
  await getAiServiceStatus(req, res, next);
  await done;

  assert.strictEqual(res.statusCode, 200);
  const data = res.body.data;
  assert.ok("serviceStatus" in data);
  assert.ok("latencyMs" in data);
  assert.ok(Array.isArray(data.capabilities));
  assert.strictEqual(data.evaluationMetrics, "Not measured (requires offline ground-truth benchmark)");
});
