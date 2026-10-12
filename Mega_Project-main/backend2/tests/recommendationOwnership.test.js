/**
 * Recommendation candidate scoping.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * A single account may hold both a WorkerProfile and an EmployerProfile.
 * `getRecommendedJobs` built its candidate pool as
 *
 *     Job.find({ status: { $in: RECOMMENDABLE_JOB_STATUSES } })
 *
 * with no owner exclusion, so a dual-role user was recommended their own
 * adverts: the same job appeared on their employer dashboard AND under
 * "Recommended Jobs for You". Confirmed in the dev database - job
 * 6ac68ecd…43c3 "Electrician is needed." is owned by user 6ac5cfcc…d32,
 * whose roles are ["worker","employer"] and who also owns WorkerProfile
 * 6ac5cfcc…d33.
 *
 * These assert the SHAPE OF THE QUERY rather than the ranked output,
 * because the exclusion has to happen in the candidate pool. Filtering
 * afterwards would still ship the job to the client, and filtering in React
 * would leave the API exposing it.
 *
 * Ranking is untouched: the AI service still scores whatever it is sent and
 * Node still preserves its order.
 */

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

const DUAL_USER = "507f1f77bcf86cd799440001";
const DUAL_WORKER = "507f1f77bcf86cd799440011";
const DUAL_EMPLOYER = "507f1f77bcf86cd799440021";

const OTHER_USER = "507f1f77bcf86cd799440002";
const OTHER_WORKER = "507f1f77bcf86cd799440012";

const OWN_JOB = "507f1f77bcf86cd799440031";
const PUBLIC_JOB = "507f1f77bcf86cd799440032";

const token = (id) => jwt.sign({ _id: id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });

function jobDoc(id, employerId, ownerUserId) {
  return {
    _id: id,
    // mirrors the controller's populate({ path: "employerId", populate: "userId" })
    employerId: { _id: employerId, userId: { _id: ownerUserId } },
    status: "open",
    title: { en: "Electrician is needed." },
    toObject() {
      return { ...this, toObject: undefined };
    },
  };
}

/**
 * Boots the app with the models mocked, and captures the filter the
 * controller hands to Job.find - which is the thing under test.
 */
async function withServer(t, { actor, engagedJobIds = [], jobs }) {
  const captured = {};
  const profiles = {
    worker: {
      [DUAL_USER]: { _id: DUAL_WORKER, userId: DUAL_USER },
      [OTHER_USER]: { _id: OTHER_WORKER, userId: OTHER_USER },
    },
    // Only the dual-role account has an employer profile.
    employer: { [DUAL_USER]: { _id: DUAL_EMPLOYER, userId: DUAL_USER } },
  };

  const mocks = [
    mock.method(User, "findById", () => ({
      select: async () => ({ _id: actor, role: "worker", roles: ["worker"] }),
    })),
    mock.method(Session, "findOne", async () => null),
    mock.method(WorkerProfile, "findOne", async (filter) => profiles.worker[String(filter.userId)] || null),
    mock.method(WorkerSkill, "find", async () => []),
    mock.method(EmployerProfile, "findOne", async (filter) => profiles.employer[String(filter?.userId)] || null),
    mock.method(Application, "distinct", async () => engagedJobIds),
    mock.method(Job, "find", (filter) => {
      captured.filter = filter;
      const matching = jobs.filter(
        (j) => !filter._id?.$nin?.some((x) => String(x) === String(j._id))
      );
      const chain = {
        populate: () => chain,
        limit: () => Promise.resolve(matching),
      };
      return chain;
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const originalFetch = global.fetch;
  global.fetch = async (url, ...rest) => {
    if (typeof url === "string" && url.includes("test-ai")) {
      // The AI service scores whatever Node sent it, in order.
      const body = JSON.parse(rest[0]?.body ?? "{}");
      return {
        ok: true,
        json: async () => ({
          matches: (body.jobs || []).map((j) => ({
            job_id: j._id,
            ranking: { overall_score: 90, match_factors: {} },
            explanation: {},
          })),
        }),
      };
    }
    return originalFetch(url, ...rest);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());

  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/jobs/recommended`, {
    headers: { Authorization: `Bearer ${token(actor)}` },
  });
  return { status: res.status, json: await res.json().catch(() => ({})), captured };
}

test("a dual-role user is NOT recommended their own job", async (t) => {
  const jobs = [jobDoc(OWN_JOB, DUAL_EMPLOYER, DUAL_USER), jobDoc(PUBLIC_JOB, "507f1f77bcf86cd799440099", "507f1f77bcf86cd799440089")];
  const { status, json, captured } = await withServer(t, { actor: DUAL_USER, jobs });

  assert.strictEqual(status, 200, JSON.stringify(json));
  const ids = json.data.map((m) => String(m.job._id));
  assert.ok(!ids.includes(OWN_JOB), "the user's own job was recommended back to them");
  assert.ok(ids.includes(PUBLIC_JOB), "another employer's job should still be recommended");
});

test("a worker with no employer profile has no owner exclusion applied", async (t) => {
  const jobs = [jobDoc(OWN_JOB, DUAL_EMPLOYER, DUAL_USER), jobDoc(PUBLIC_JOB, "507f1f77bcf86cd799440099", "507f1f77bcf86cd799440089")];
  const { status, json, captured } = await withServer(t, { actor: OTHER_USER, jobs });

  assert.strictEqual(status, 200);
  // The job is hidden from its OWNER only - every other worker still sees it.
  const ids = json.data.map((m) => String(m.job._id));
  assert.ok(ids.includes(OWN_JOB), "the job was hidden globally instead of just from its owner");
  assert.ok(ids.includes(PUBLIC_JOB));
  assert.strictEqual(ids.length, 2);
});

test("a job the worker already applied to or was invited to is not re-recommended", async (t) => {
  // It belongs in My Applications / Job Requests. Showing it again reads as a
  // fresh opportunity and invites a duplicate the unique index would reject.
  const jobs = [jobDoc(OWN_JOB, "507f1f77bcf86cd799440098", "507f1f77bcf86cd799440088"), jobDoc(PUBLIC_JOB, "507f1f77bcf86cd799440099", "507f1f77bcf86cd799440089")];
  const { status, json, captured } = await withServer(t, {
    actor: OTHER_USER,
    engagedJobIds: [OWN_JOB],
    jobs,
  });

  assert.strictEqual(status, 200);
  assert.deepStrictEqual(captured.filter._id?.$nin?.map(String), [OWN_JOB]);
  const ids = json.data.map((m) => String(m.job._id));
  assert.deepStrictEqual(ids, [PUBLIC_JOB]);
});

test("the eligible-status filter is preserved alongside the new exclusions", async (t) => {
  const jobs = [jobDoc(PUBLIC_JOB, "507f1f77bcf86cd799440099", "507f1f77bcf86cd799440089")];
  const { captured } = await withServer(t, { actor: DUAL_USER, jobs });

  assert.deepStrictEqual(
    captured.filter.status,
    { $in: ["open", "partially_assigned"] },
    "the existing eligibility pre-filter was changed"
  );
});

test("ranking and order still come from the AI service untouched", async (t) => {
  const jobs = [jobDoc(PUBLIC_JOB, "507f1f77bcf86cd799440099", "507f1f77bcf86cd799440089")];
  const { json } = await withServer(t, { actor: OTHER_USER, jobs });

  assert.strictEqual(json.data[0].matchScore, 90, "Node altered the AI service's score");
  assert.ok("matchFactors" in json.data[0]);
});

// --- owner references that cannot be resolved -----------------------------
//
// The exclusion reads job.employerId.userId._id, which only exists because
// the candidate query populates that path. If a populate ever fails, an
// employer record is deleted, or the field arrives as a bare ObjectId, the
// job must still be offered - dropping it would silently empty a worker's
// recommendations for a reason nobody could see.

test("a job whose employer reference is unpopulated is still recommended", async (t) => {
  const bare = { _id: PUBLIC_JOB, employerId: "507f1f77bcf86cd799440099", status: "open",
    title: { en: "Bare ref" }, toObject() { return { ...this, toObject: undefined }; } };
  const { status, json } = await withServer(t, { actor: DUAL_USER, jobs: [bare] });

  assert.strictEqual(status, 200);
  assert.deepStrictEqual(json.data.map((m) => String(m.job._id)), [PUBLIC_JOB]);
});

test("a job whose employer was deleted is still recommended", async (t) => {
  const orphan = { _id: PUBLIC_JOB, employerId: null, status: "open",
    title: { en: "Orphan" }, toObject() { return { ...this, toObject: undefined }; } };
  const { status, json } = await withServer(t, { actor: DUAL_USER, jobs: [orphan] });

  assert.strictEqual(status, 200);
  assert.deepStrictEqual(json.data.map((m) => String(m.job._id)), [PUBLIC_JOB]);
});

test("a populated employer with no user still does not crash the endpoint", async (t) => {
  const halfPopulated = { _id: PUBLIC_JOB, employerId: { _id: "507f1f77bcf86cd799440099", userId: null },
    status: "open", title: { en: "Half" }, toObject() { return { ...this, toObject: undefined }; } };
  const { status, json } = await withServer(t, { actor: DUAL_USER, jobs: [halfPopulated] });

  assert.strictEqual(status, 200);
  assert.deepStrictEqual(json.data.map((m) => String(m.job._id)), [PUBLIC_JOB]);
});

test("ownership is still excluded when the id is an ObjectId-like object, not a string", async (t) => {
  // Mongoose hands back ObjectId instances; the comparison must stringify.
  const asObjectId = {
    _id: OWN_JOB,
    employerId: { _id: DUAL_EMPLOYER, userId: { _id: { toString: () => DUAL_USER } } },
    status: "open", title: { en: "Own" }, toObject() { return { ...this, toObject: undefined }; },
  };
  const { status, json } = await withServer(t, { actor: DUAL_USER, jobs: [asObjectId] });

  assert.strictEqual(status, 200);
  assert.deepStrictEqual(json.data, [], "own job leaked when the id was an ObjectId instance");
});
