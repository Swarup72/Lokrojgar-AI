import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import jwt from "jsonwebtoken";

process.env.AI_SERVICE_URL = "http://test-ai:9000";
process.env.ACCESS_TOKEN_SECRET = "test_access_token_secret_32_chars_long!!";

import { app } from "../src/app.js";
import User from "../src/models/user.model.js";
import Session from "../src/models/session.model.js";
import Job from "../src/models/job.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import Application from "../src/models/application.model.js";
import Notification from "../src/models/notification.model.js";
import DeviceToken from "../src/models/deviceToken.model.js";

function makeToken(payload) {
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
}

function fakeScoringResponse() {
  return {
    ok: true,
    json: async () => ({
      worker_id: "507f1f77bcf86cd799439011",
      job_id: "507f1f77bcf86cd799439012",
      ranking: {
        overall_score: 90,
        match_factors: { skill: 95, location: 85, availability: 100, pay: null, rating: null, relevance: 80 },
      },
      explanation: {},
    }),
  };
}

test("LIVE HTTP: Worker applies for job via POST /api/v1/applications/apply", async (t) => {
  const workerUser = { _id: "507f1f77bcf86cd799439001", role: "worker", roles: ["worker"] };
  const workerProfile = { _id: "507f1f77bcf86cd799439011", userId: workerUser._id, fullName: "HTTP Worker" };
  const jobDoc = {
    _id: "507f1f77bcf86cd799439012",
    status: "open",
    employerId: "507f1f77bcf86cd799439021",
    requiredWorkers: 2,
    filledWorkers: 0,
    title: { en: "Plumbing Job" },
  };

  const mocks = [
    mock.method(User, "findById", () => ({
      select: async () => workerUser,
    })),
    mock.method(Session, "findOne", async () => null),
    mock.method(WorkerProfile, "findOne", async () => workerProfile),
    mock.method(Job, "findById", async () => jobDoc),
    mock.method(WorkerSkill, "find", async () => []),
    mock.method(Application, "findOne", async () => null),
    mock.method(Application, "create", async (doc) => ({ _id: "507f1f77bcf86cd799439031", ...doc })),
    mock.method(EmployerProfile, "findById", async () => null),
  ];

  const originalFetch = global.fetch;
  global.fetch = async (url, ...args) => {
    if (typeof url === "string" && (url.includes("test-ai") || url.includes(":9000"))) {
      return fakeScoringResponse();
    }
    return originalFetch(url, ...args);
  };

  t.after(() => {
    mocks.forEach((m) => m.mock.restore());
    global.fetch = originalFetch;
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const port = server.address().port;

  const token = makeToken({ _id: workerUser._id, role: "worker", roles: ["worker"] });

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/applications/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobId: "507f1f77bcf86cd799439012", coverNote: "Ready to work" }),
  });

  const body = await response.json();
  assert.strictEqual(response.status, 201);
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.data.application.status, "applied");
  assert.strictEqual(body.data.application.matchScore, 90);
});

test("LIVE HTTP: Employer cannot apply as worker (403 Forbidden)", async (t) => {
  const employerUser = { _id: "507f1f77bcf86cd799439002", role: "employer", roles: ["employer"] };

  const mocks = [
    mock.method(User, "findById", () => ({
      select: async () => employerUser,
    })),
    mock.method(Session, "findOne", async () => null),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const port = server.address().port;

  const token = makeToken({ _id: employerUser._id, role: "employer", roles: ["employer"] });

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/applications/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobId: "507f1f77bcf86cd799439012" }),
  });

  const body = await response.json();
  assert.strictEqual(response.status, 403);
  assert.strictEqual(body.success, false);
});

test("LIVE HTTP: Duplicate application receives 409 Conflict", async (t) => {
  const workerUser = { _id: "507f1f77bcf86cd799439001", role: "worker", roles: ["worker"] };
  const workerProfile = { _id: "507f1f77bcf86cd799439011", userId: workerUser._id };
  const jobDoc = { _id: "507f1f77bcf86cd799439012", status: "open", requiredWorkers: 2, filledWorkers: 0 };

  const mocks = [
    mock.method(User, "findById", () => ({
      select: async () => workerUser,
    })),
    mock.method(Session, "findOne", async () => null),
    mock.method(WorkerProfile, "findOne", async () => workerProfile),
    mock.method(Job, "findById", async () => jobDoc),
    mock.method(Application, "findOne", async () => ({ _id: "APP_EXISTING", status: "applied" })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const port = server.address().port;

  const token = makeToken({ _id: workerUser._id, role: "worker", roles: ["worker"] });

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/applications/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobId: "507f1f77bcf86cd799439012" }),
  });

  const body = await response.json();
  assert.strictEqual(response.status, 409);
  assert.match(body.message, /already applied/i);
});

test("LIVE HTTP: Employer accepts application with atomic capacity increment", async (t) => {
  const employerUser = { _id: "507f1f77bcf86cd799439002", role: "employer", roles: ["employer"] };
  const employerProfile = { _id: "507f1f77bcf86cd799439021", userId: employerUser._id };
  const appDoc = {
    _id: "507f1f77bcf86cd799439031",
    status: "applied",
    jobId: {
      _id: "507f1f77bcf86cd799439012",
      employerId: employerProfile._id,
      status: "open",
      requiredWorkers: 2,
      filledWorkers: 0,
      title: { en: "Painting Job" },
    },
    workerId: { _id: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439001" },
  };

  const mocks = [
    mock.method(User, "findById", () => ({
      select: async () => employerUser,
    })),
    mock.method(Session, "findOne", async () => null),
    mock.method(EmployerProfile, "findOne", async () => employerProfile),
    mock.method(Application, "findById", () => ({
      populate: async () => appDoc,
    })),
    mock.method(Application, "findOneAndUpdate", async () => ({ _id: appDoc._id, status: "accepted" })),
    mock.method(Job, "findOneAndUpdate", async () => ({ _id: appDoc.jobId._id, filledWorkers: 1, status: "partially_assigned" })),
    mock.method(Notification, "create", async (doc) => ({ _id: "NOTIF01", ...doc })),
    mock.method(DeviceToken, "find", async () => []),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const port = server.address().port;

  const token = makeToken({ _id: employerUser._id, role: "employer", roles: ["employer"] });

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/applications/${appDoc._id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "accepted" }),
  });

  const body = await response.json();
  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.data.status, "accepted");
});

test("LIVE HTTP: Employer rejects application cleanly", async (t) => {
  const employerUser = { _id: "507f1f77bcf86cd799439002", role: "employer", roles: ["employer"] };
  const employerProfile = { _id: "507f1f77bcf86cd799439021", userId: employerUser._id };
  const appDoc = {
    _id: "507f1f77bcf86cd799439031",
    status: "applied",
    jobId: {
      _id: "507f1f77bcf86cd799439012",
      employerId: employerProfile._id,
      status: "open",
    },
    workerId: { _id: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439001" },
    save: async function () {
      return this;
    },
  };

  const mocks = [
    mock.method(User, "findById", () => ({
      select: async () => employerUser,
    })),
    mock.method(Session, "findOne", async () => null),
    mock.method(EmployerProfile, "findOne", async () => employerProfile),
    mock.method(Application, "findById", () => ({
      populate: async () => appDoc,
    })),
    // Rejection is now a conditional update (guarded on status != accepted)
    // rather than a blind save(), so it cannot clobber a concurrent accept.
    mock.method(Application, "findOneAndUpdate", async (filter) => ({ _id: filter._id, status: "rejected" })),
    mock.method(Notification, "create", async (doc) => ({ _id: "NOTIF02", ...doc })),
    mock.method(DeviceToken, "find", async () => []),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const port = server.address().port;

  const token = makeToken({ _id: employerUser._id, role: "employer", roles: ["employer"] });

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/applications/${appDoc._id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "rejected" }),
  });

  const body = await response.json();
  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.data.status, "rejected");
});

test("LIVE HTTP: IDOR attempt by non-owner employer yields 403", async (t) => {
  const attackerUser = { _id: "507f1f77bcf86cd799439099", role: "employer", roles: ["employer"] };
  const attackerProfile = { _id: "507f1f77bcf86cd799439099_PROFILE", userId: attackerUser._id };
  const appDoc = {
    _id: "507f1f77bcf86cd799439031",
    status: "applied",
    jobId: {
      _id: "507f1f77bcf86cd799439012",
      employerId: "OTHER_EMPLOYER_PROFILE_ID",
    },
  };

  const mocks = [
    mock.method(User, "findById", () => ({
      select: async () => attackerUser,
    })),
    mock.method(Session, "findOne", async () => null),
    mock.method(EmployerProfile, "findOne", async () => attackerProfile),
    mock.method(Application, "findById", () => ({
      populate: async () => appDoc,
    })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const port = server.address().port;

  const token = makeToken({ _id: attackerUser._id, role: "employer", roles: ["employer"] });

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/applications/${appDoc._id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "accepted" }),
  });

  const body = await response.json();
  assert.strictEqual(response.status, 403);
  assert.strictEqual(body.success, false);
});
