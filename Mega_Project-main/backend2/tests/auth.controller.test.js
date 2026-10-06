import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

process.env.ACCESS_TOKEN_SECRET = "test-access-secret";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret";

import User from "../src/models/user.model.js";
import Session from "../src/models/session.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import { register, addRole } from "../src/controllers/auth.controller.js";
import { validate } from "../src/middlewares/validate.middleware.js";
import { registerValidator } from "../src/validators/auth.validator.js";

// Mirrors the fakeReqRes harness already used in voiceProfile.controller.test.js -
// same shape, so this file follows the project's existing test conventions
// rather than introducing a new one.
function fakeReqRes({ user, body = {}, params = {} } = {}) {
  const req = { user, body, params, headers: {} };
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  const res = {
    statusCode: null,
    body: null,
    cookie() {
      return this;
    },
    clearCookie() {
      return this;
    },
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

function fakeUser(overrides = {}) {
  return {
    _id: "USER001",
    roles: ["worker"],
    generateAccessToken: () => "fake-access-token",
    generateRefreshToken: () => "fake-refresh-token",
    save: async function () {
      return this;
    },
    ...overrides,
  };
}

// Runs the exact same middleware chain Express uses for this route
// (validate(registerValidator) then register), so a rejection at the
// validator genuinely proves the controller/User.create() is never reached -
// this isn't just testing the Zod schema in isolation.
async function runRegisterThroughMiddlewareChain(body) {
  const { req, res, next, done } = fakeReqRes({ body });
  let controllerRan = false;

  validate(registerValidator)(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    controllerRan = true;
    register(req, res, next);
  });

  // `done` resolves exactly once, from whichever path actually fires:
  // validate()'s next(err) on rejection, or register()'s next(err)/res.json()
  // on success - never hardcode either outcome here.
  const { error } = await done;
  return { req, res, controllerRan, error };
}

// --- A/B/C: admin must be rejected before User.create() is ever reached -----

test("register: pure admin role is rejected, no user created, no tokens returned", async (t) => {
  const userCreateMock = mock.method(User, "create", async () => {
    throw new Error("User.create must NOT be called for an admin registration attempt");
  });
  t.after(() => userCreateMock.mock.restore());

  const { controllerRan, error } = await runRegisterThroughMiddlewareChain({
    phone: "9000000001",
    password: "password123",
    roles: ["admin"],
  });

  assert.strictEqual(controllerRan, false, "register controller must never run for roles:['admin']");
  assert.ok(error, "validation must reject the request");
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(userCreateMock.mock.callCount(), 0);
});

test("register: mixed worker+admin roles is rejected, no user created, no tokens returned", async (t) => {
  const userCreateMock = mock.method(User, "create", async () => {
    throw new Error("User.create must NOT be called for a worker+admin registration attempt");
  });
  t.after(() => userCreateMock.mock.restore());

  const { controllerRan, error } = await runRegisterThroughMiddlewareChain({
    phone: "9000000002",
    password: "password123",
    roles: ["worker", "admin"],
  });

  assert.strictEqual(controllerRan, false);
  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(userCreateMock.mock.callCount(), 0);
});

test("register: mixed employer+admin roles is rejected, no user created, no tokens returned", async (t) => {
  const userCreateMock = mock.method(User, "create", async () => {
    throw new Error("User.create must NOT be called for an employer+admin registration attempt");
  });
  t.after(() => userCreateMock.mock.restore());

  const { controllerRan, error } = await runRegisterThroughMiddlewareChain({
    phone: "9000000003",
    password: "password123",
    roles: ["employer", "admin"],
  });

  assert.strictEqual(controllerRan, false);
  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(userCreateMock.mock.callCount(), 0);
});

// --- D/E: legitimate worker/employer registration is unaffected -------------

test("register: worker registration still succeeds exactly as before", async (t) => {
  const createdUser = fakeUser({ roles: ["worker"] });
  const userFindOneMock = mock.method(User, "findOne", async () => null);
  const userCreateMock = mock.method(User, "create", async () => createdUser);
  const userFindByIdMock = mock.method(User, "findById", () => ({
    select: async () => createdUser,
  }));
  const workerProfileCreateMock = mock.method(WorkerProfile, "create", async () => ({}));
  const sessionCreateMock = mock.method(Session, "create", async () => ({}));

  t.after(() => {
    userFindOneMock.mock.restore();
    userCreateMock.mock.restore();
    userFindByIdMock.mock.restore();
    workerProfileCreateMock.mock.restore();
    sessionCreateMock.mock.restore();
  });

  const { controllerRan, error, res } = await runRegisterThroughMiddlewareChain({
    phone: "9000000004",
    password: "password123",
    roles: ["worker"],
    fullName: "Test Worker",
  });

  assert.strictEqual(controllerRan, true);
  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(userCreateMock.mock.callCount(), 1);
  assert.deepStrictEqual(userCreateMock.mock.calls[0].arguments[0].roles, ["worker"]);
  assert.ok(res.body.data.accessToken, "a usable access token must be returned");
  assert.ok(res.body.data.refreshToken, "a usable refresh token must be returned");
});

test("register: employer registration still succeeds exactly as before", async (t) => {
  const createdUser = fakeUser({ roles: ["employer"] });
  const userFindOneMock = mock.method(User, "findOne", async () => null);
  const userCreateMock = mock.method(User, "create", async () => createdUser);
  const userFindByIdMock = mock.method(User, "findById", () => ({
    select: async () => createdUser,
  }));
  const employerProfileCreateMock = mock.method(EmployerProfile, "create", async () => ({}));
  const sessionCreateMock = mock.method(Session, "create", async () => ({}));

  t.after(() => {
    userFindOneMock.mock.restore();
    userCreateMock.mock.restore();
    userFindByIdMock.mock.restore();
    employerProfileCreateMock.mock.restore();
    sessionCreateMock.mock.restore();
  });

  const { controllerRan, error, res } = await runRegisterThroughMiddlewareChain({
    phone: "9000000005",
    password: "password123",
    roles: ["employer"],
    businessName: "Test Biz",
  });

  assert.strictEqual(controllerRan, true);
  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(userCreateMock.mock.callCount(), 1);
  assert.deepStrictEqual(userCreateMock.mock.calls[0].arguments[0].roles, ["employer"]);
  assert.ok(res.body.data.accessToken);
  assert.ok(res.body.data.refreshToken);
});

// --- F: addRole's existing admin restriction remains intact ------------------

test("addRole: still rejects admin and does not mutate the user's roles", async (t) => {
  const existingUser = fakeUser({ roles: ["worker"] });
  const userFindByIdMock = mock.method(User, "findById", async () => existingUser);
  t.after(() => userFindByIdMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "USER001" },
    body: { role: "admin" },
  });

  addRole(req, res, next);
  const { error } = await done;

  assert.ok(error, "addRole must reject role:'admin'");
  assert.strictEqual(error.statusCode, 400);
  assert.deepStrictEqual(existingUser.roles, ["worker"], "roles array must not be mutated");
});

// =============================================================================
// A role is meaningless without its profile.
//
// register() only created a WorkerProfile/EmployerProfile when the matching
// name was supplied, and both models declare that name as required - so
// registering a role without it produced a User with NO profile. Every later
// action for that role then failed with "profile not found" (404), which the
// UI renders as "We couldn't find what you were looking for." Two real
// employer accounts in the dev database were left in exactly this state and
// could not post a job at all.
//
// The validator now rejects the request outright, so the half-formed account
// is unreachable rather than merely discouraged.
// =============================================================================

for (const missing of [undefined, "", "   "]) {
  test(`register: worker role with fullName=${JSON.stringify(missing)} is rejected before User.create()`, async () => {
    const { controllerRan, error } = await runRegisterThroughMiddlewareChain({
      phone: "9876543210",
      password: "secret123",
      roles: ["worker"],
      ...(missing === undefined ? {} : { fullName: missing }),
    });

    assert.ok(error, "the request must be rejected");
    assert.strictEqual(error.statusCode, 400);
    assert.match(error.message, /full name is required/i);
    assert.strictEqual(controllerRan, false, "no User may be created without its profile");
  });

  test(`register: employer role with businessName=${JSON.stringify(missing)} is rejected before User.create()`, async () => {
    const { controllerRan, error } = await runRegisterThroughMiddlewareChain({
      phone: "9876543211",
      password: "secret123",
      roles: ["employer"],
      ...(missing === undefined ? {} : { businessName: missing }),
    });

    assert.ok(error);
    assert.strictEqual(error.statusCode, 400);
    assert.match(error.message, /business name is required/i);
    assert.strictEqual(controllerRan, false);
  });
}

test("register: a user taking BOTH roles must supply both names", async () => {
  const onlyWorkerName = await runRegisterThroughMiddlewareChain({
    phone: "9876543212",
    password: "secret123",
    roles: ["worker", "employer"],
    fullName: "Both Roles",
  });
  assert.strictEqual(onlyWorkerName.error.statusCode, 400);
  assert.match(onlyWorkerName.error.message, /business name is required/i);
  assert.strictEqual(onlyWorkerName.controllerRan, false);
});

test("register: a valid worker still registers and reaches the controller", async (t) => {
  const userCreateMock = mock.method(User, "create", async (doc) => ({
    _id: "USER_OK",
    ...doc,
    generateAccessToken: () => "access",
    generateRefreshToken: () => "refresh",
    save: async () => {},
  }));
  const workerCreateMock = mock.method(WorkerProfile, "create", async (doc) => ({ _id: "WP_OK", ...doc }));
  const userFindOneMock = mock.method(User, "findOne", async () => null);
  const sessionCreateMock = mock.method(Session, "create", async () => ({ _id: "S1" }));
  t.after(() => {
    userCreateMock.mock.restore();
    workerCreateMock.mock.restore();
    userFindOneMock.mock.restore();
    sessionCreateMock.mock.restore();
  });

  const { controllerRan } = await runRegisterThroughMiddlewareChain({
    phone: "9876543213",
    password: "secret123",
    roles: ["worker"],
    fullName: "Valid Worker",
  });

  assert.strictEqual(controllerRan, true, "a complete registration must still go through");
  // The profile is created in the same request - the invariant this fix protects.
  assert.strictEqual(workerCreateMock.mock.callCount(), 1, "the WorkerProfile must be created");
});
