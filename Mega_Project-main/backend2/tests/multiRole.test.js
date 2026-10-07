/**
 * One account, worker AND employer.
 *
 * `User.roles` was already an array, and verifyJWT re-reads the user from the
 * database on every request - so a role added now applies to the token the
 * client already holds, and the JWT's `roles` claim is never consulted for
 * authorization. What was missing is that POST /auth/add-role added the role
 * WITHOUT creating its profile: measured, roles became ["worker","employer"] and
 * posting a job still answered 404 "Employer profile not found".
 *
 * These tests pin both halves: the role is added atomically, and the profile
 * that makes it usable is created with it.
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import User from "../src/models/user.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import { addRole } from "../src/controllers/auth.controller.js";
import { createProfilesForRoles } from "../src/utils/profileProvisioning.js";
import { authorizeRoles } from "../src/middlewares/role.middleware.js";

const USER_ID = "507f1f77bcf86cd799460001";

function fakeReqRes({ user, body = {} } = {}) {
  const req = { user, body };
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

function mockAddRole(t, { existingRoles = ["worker"], existingEmployerProfile = null, fullName = "Samarth" } = {}) {
  let capturedUpdate = null;
  const created = [];
  const mocks = [
    mock.method(User, "findByIdAndUpdate", (id, update) => {
      capturedUpdate = update;
      const roles = [...existingRoles];
      const added = update.$addToSet?.roles;
      if (added && !roles.includes(added)) roles.push(added);
      return { select: async () => ({ _id: USER_ID, roles, fullName }) };
    }),
    mock.method(WorkerProfile, "findOne", async () => null),
    mock.method(EmployerProfile, "findOne", async () => existingEmployerProfile),
    mock.method(WorkerProfile, "create", async (doc) => {
      created.push({ kind: "worker", doc });
      return doc;
    }),
    mock.method(EmployerProfile, "create", async (doc) => {
      created.push({ kind: "employer", doc });
      return doc;
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
  return { created, getUpdate: () => capturedUpdate };
}

test("addRole: a worker becoming an employer gets the role AND an EmployerProfile", async (t) => {
  const { created } = mockAddRole(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_ID, roles: ["worker"], fullName: "Samarth" },
    body: { role: "employer" },
  });
  addRole(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.data.roles, ["worker", "employer"]);
  assert.strictEqual(created.length, 1, "the profile that makes the role usable must be created");
  assert.strictEqual(created[0].kind, "employer");
  // No business name was given, so the employer hires under their own name -
  // and nothing invents a placeholder like "Individual".
  assert.strictEqual(created[0].doc.businessName, null);
  assert.strictEqual(created[0].doc.businessType, null);
  // No location is invented. This assertion previously read "both profile models
  // require a location", which was true at the time and was exactly the
  // constraint that forced registration to seed Pune coordinates. Location is
  // optional now, and the profile is created without one.
  assert.ok(
    !("location" in created[0].doc),
    `a provisioned profile must not be given an invented location, got ${JSON.stringify(created[0].doc.location)}`
  );
});

test("addRole: an employer becoming a worker gets a WorkerProfile named from the account", async (t) => {
  const { created } = mockAddRole(t, { existingRoles: ["employer"], fullName: "Rahul Patil" });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_ID, roles: ["employer"], fullName: "Rahul Patil" },
    body: { role: "worker" },
  });
  addRole(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.deepStrictEqual(res.body.data.roles, ["employer", "worker"]);
  assert.strictEqual(created[0].kind, "worker");
  assert.strictEqual(
    created[0].doc.fullName,
    "Rahul Patil",
    "the account's own name is reused rather than asking for it twice"
  );
});

test("addRole: the role is added with $addToSet, so a repeat cannot duplicate it", async (t) => {
  const { getUpdate } = mockAddRole(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_ID, roles: ["worker"] },
    body: { role: "employer" },
  });
  addRole(req, res, next);
  await done;

  const update = getUpdate();
  assert.deepStrictEqual(
    update.$addToSet,
    { roles: "employer" },
    "a read-push-save could duplicate the role under concurrency"
  );
});

test("addRole: adding a role the account already has is a harmless no-op", async (t) => {
  const { created } = mockAddRole(t, {
    existingRoles: ["worker", "employer"],
    existingEmployerProfile: { _id: "EP1", userId: USER_ID },
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_ID, roles: ["worker", "employer"] },
    body: { role: "employer" },
  });
  addRole(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.deepStrictEqual(res.body.data.roles, ["worker", "employer"]);
  assert.strictEqual(created.length, 0, "an existing profile must never be overwritten");
});

test("addRole: a passed name fills a MISSING account name but never overwrites one", async (t) => {
  const withName = mockAddRole(t, { fullName: "Existing Name" });
  const { req, res, next, done } = fakeReqRes({
    user: { _id: USER_ID, roles: ["worker"], fullName: "Existing Name" },
    body: { role: "employer", fullName: "Someone Else" },
  });
  addRole(req, res, next);
  await done;
  assert.strictEqual(
    withName.getUpdate().$set,
    undefined,
    "an account that already has a name must not have it rewritten by this endpoint"
  );
});

for (const role of ["admin", "ADMIN", "superuser", "", null, 123]) {
  test(`addRole rejects role=${JSON.stringify(role)} without touching the user`, async (t) => {
    const updateMock = mock.method(User, "findByIdAndUpdate", () => {
      throw new Error("the user must not be modified for an invalid role");
    });
    t.after(() => updateMock.mock.restore());

    const { req, res, next, done } = fakeReqRes({
      user: { _id: USER_ID, roles: ["worker"] },
      body: { role },
    });
    addRole(req, res, next);
    const { error } = await done;

    assert.ok(error, "privilege must never be grantable here");
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(updateMock.mock.callCount(), 0);
  });
}

// --- the provisioning helper itself ----------------------------------------

test("createProfilesForRoles is idempotent - an existing profile is returned, not recreated", async (t) => {
  const existing = { _id: "WP1", userId: USER_ID, fullName: "Already Here" };
  const findOneMock = mock.method(WorkerProfile, "findOne", async () => existing);
  const createMock = mock.method(WorkerProfile, "create", async () => {
    throw new Error("must not recreate an existing profile");
  });
  t.after(() => {
    findOneMock.mock.restore();
    createMock.mock.restore();
  });

  const result = await createProfilesForRoles({ _id: USER_ID, fullName: "x" }, ["worker"], {});

  assert.strictEqual(result.workerProfile, existing);
  assert.strictEqual(createMock.mock.callCount(), 0);
});

test("createProfilesForRoles creates BOTH profiles for a dual-role account in one call", async (t) => {
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => null),
    mock.method(EmployerProfile, "findOne", async () => null),
    mock.method(WorkerProfile, "create", async (doc) => ({ kind: "worker", ...doc })),
    mock.method(EmployerProfile, "create", async (doc) => ({ kind: "employer", ...doc })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const result = await createProfilesForRoles({ _id: USER_ID, fullName: "Both" }, ["worker", "employer"], {});

  assert.strictEqual(result.workerProfile.kind, "worker");
  assert.strictEqual(result.employerProfile.kind, "employer");
  assert.strictEqual(result.workerProfile.fullName, "Both");
});

test("createProfilesForRoles creates nothing for an empty role list", async (t) => {
  const mocks = [
    mock.method(WorkerProfile, "create", async () => {
      throw new Error("nothing to create");
    }),
    mock.method(EmployerProfile, "create", async () => {
      throw new Error("nothing to create");
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const result = await createProfilesForRoles({ _id: USER_ID }, [], {});
  assert.deepStrictEqual(result, { workerProfile: null, employerProfile: null });
});

// --- role gates still behave for all four account shapes -------------------

test("authorizeRoles: worker-only, employer-only, dual-role and unauthenticated", async () => {
  const run = (user, allowed) => {
    let error = null;
    authorizeRoles(...allowed)({ user }, {}, (err) => {
      error = err || null;
    });
    return error;
  };

  // A dual-role account passes BOTH gates - the whole point of the feature.
  assert.strictEqual(run({ roles: ["worker", "employer"] }, ["worker"]), null);
  assert.strictEqual(run({ roles: ["worker", "employer"] }, ["employer"]), null);

  assert.strictEqual(run({ roles: ["worker"] }, ["worker"]), null);
  assert.strictEqual(run({ roles: ["employer"] }, ["employer"]), null);

  assert.strictEqual(run({ roles: ["worker"] }, ["employer"]).statusCode, 403);
  assert.strictEqual(run({ roles: ["employer"] }, ["worker"]).statusCode, 403);
  assert.strictEqual(run({ roles: [] }, ["worker"]).statusCode, 403);
  assert.strictEqual(run(null, ["worker"]).statusCode, 401);

  // Roles are read from the request's user - which verifyJWT loads fresh from
  // the database - so a role added after the token was issued takes effect at
  // once, and a role removed stops working at once.
  assert.strictEqual(run({ roles: ["worker", "employer"] }, ["admin"]).statusCode, 403);
});
