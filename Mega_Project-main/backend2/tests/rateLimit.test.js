import test from "node:test";
import assert from "node:assert";
import { app } from "../src/app.js";
import {
  DEV_RATE_LIMIT_MAX,
  PROD_RATE_LIMIT_MAX,
  globalRateLimiter,
  loginRateLimiter,
  resolveRateLimitMax,
  resolveLoginRateLimitKey,
} from "../src/middlewares/rateLimiter.middleware.js";
import User from "../src/models/user.model.js";
import { mock } from "node:test";

// --- resolveRateLimitMax: which ceiling applies -----------------------------

test("development defaults to the high ceiling so normal dev usage is not throttled", () => {
  assert.strictEqual(resolveRateLimitMax({ NODE_ENV: "development" }), 1000);
  assert.strictEqual(resolveRateLimitMax({ NODE_ENV: "development" }), DEV_RATE_LIMIT_MAX);
});

test("production keeps the original lower ceiling of 100", () => {
  assert.strictEqual(resolveRateLimitMax({ NODE_ENV: "production" }), 100);
  assert.strictEqual(resolveRateLimitMax({ NODE_ENV: "production" }), PROD_RATE_LIMIT_MAX);
  assert.ok(PROD_RATE_LIMIT_MAX < DEV_RATE_LIMIT_MAX, "production must stay stricter than development");
});

test("an unset NODE_ENV is treated as non-production, not as production", () => {
  assert.strictEqual(resolveRateLimitMax({}), DEV_RATE_LIMIT_MAX);
  assert.strictEqual(resolveRateLimitMax({ NODE_ENV: "test" }), DEV_RATE_LIMIT_MAX);
});

test("RATE_LIMIT_MAX overrides the default in both development and production", () => {
  assert.strictEqual(resolveRateLimitMax({ NODE_ENV: "development", RATE_LIMIT_MAX: "250" }), 250);
  assert.strictEqual(resolveRateLimitMax({ NODE_ENV: "production", RATE_LIMIT_MAX: "40" }), 40);
  assert.strictEqual(resolveRateLimitMax({ NODE_ENV: "production", RATE_LIMIT_MAX: "5000" }), 5000);
});

for (const bad of ["", "0", "-5", "abc", "NaN", " "]) {
  test(`an invalid RATE_LIMIT_MAX (${JSON.stringify(bad)}) falls back to the default instead of disabling the limiter`, () => {
    const devValue = resolveRateLimitMax({ NODE_ENV: "development", RATE_LIMIT_MAX: bad });
    const prodValue = resolveRateLimitMax({ NODE_ENV: "production", RATE_LIMIT_MAX: bad });
    assert.strictEqual(devValue, DEV_RATE_LIMIT_MAX);
    assert.strictEqual(prodValue, PROD_RATE_LIMIT_MAX);
    assert.ok(Number.isFinite(devValue) && devValue > 0, "rate limiting must never be switched off");
  });
}

test("a fractional RATE_LIMIT_MAX is floored to a whole number of requests", () => {
  assert.strictEqual(resolveRateLimitMax({ RATE_LIMIT_MAX: "10.9" }), 10);
});

// --- Live behaviour against the real app ------------------------------------
// These exercise src/app.js itself (real middleware order, real CORS, real
// limiter), not a reconstruction of it.

let baseUrl;
let server;

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server?.close();
});

// The limiter keys on req.ip, whose exact form varies by stack; resetting
// every plausible loopback key keeps the HTTP tests independent of each other.
function resetRateLimit() {
  for (const ip of ["::1", "::ffff:127.0.0.1", "127.0.0.1"]) {
    globalRateLimiter.resetKey(ip);
    loginRateLimiter.resetKey(ip);
    for (const phone of ["9876543201", "9876543202", "9876543203", "9998887776", "9112233445"]) {
      loginRateLimiter.resetKey(`${ip}_${phone}`);
    }
  }
}

const ORIGIN = "http://localhost:5173";

const get = (path = "/health") => fetch(`${baseUrl}${path}`, { headers: { Origin: ORIGIN } });

const preflight = (path = "/health") =>
  fetch(`${baseUrl}${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });

test("OPTIONS preflight requests do not consume any rate-limit quota", async (t) => {
  process.env.RATE_LIMIT_MAX = "3";
  resetRateLimit();
  t.after(() => {
    delete process.env.RATE_LIMIT_MAX;
    resetRateLimit();
  });

  for (let i = 0; i < 25; i++) {
    const response = await preflight();
    assert.ok(response.status < 400, `preflight ${i + 1} should succeed, got ${response.status}`);
  }

  // 25 preflights are 8x the configured limit; if any had been counted, these
  // three normal requests could not all succeed.
  for (let i = 0; i < 3; i++) {
    assert.strictEqual((await get()).status, 200, `request ${i + 1} should still be allowed`);
  }
});

test("normal requests still count toward the limit and are rejected past it", async (t) => {
  process.env.RATE_LIMIT_MAX = "3";
  resetRateLimit();
  t.after(() => {
    delete process.env.RATE_LIMIT_MAX;
    resetRateLimit();
  });

  for (let i = 0; i < 3; i++) {
    assert.strictEqual((await get()).status, 200, `request ${i + 1} should be allowed`);
  }

  const blocked = await get();
  assert.strictEqual(blocked.status, 429, "the request past the limit must be rejected");

  const body = await blocked.json();
  assert.strictEqual(body.statusCode, 429);
  assert.strictEqual(body.success, false);
  assert.match(body.message, /too many requests/i);
});

test("a rate-limited 429 still carries the CORS headers the browser requires", async (t) => {
  process.env.RATE_LIMIT_MAX = "1";
  resetRateLimit();
  t.after(() => {
    delete process.env.RATE_LIMIT_MAX;
    resetRateLimit();
  });

  const allowed = await get();
  assert.strictEqual(allowed.status, 200);
  const allowedOrigin = allowed.headers.get("access-control-allow-origin");
  assert.ok(allowedOrigin, "sanity: a normal response must carry the CORS origin header");

  const blocked = await get();
  assert.strictEqual(blocked.status, 429);
  assert.strictEqual(
    blocked.headers.get("access-control-allow-origin"),
    allowedOrigin,
    "a 429 must carry the same CORS origin header as a normal response, or the browser reports an opaque CORS error instead of the real 429"
  );
});

test("preflight still succeeds after the limit is exhausted, so the browser sees the real 429", async (t) => {
  process.env.RATE_LIMIT_MAX = "1";
  resetRateLimit();
  t.after(() => {
    delete process.env.RATE_LIMIT_MAX;
    resetRateLimit();
  });

  assert.strictEqual((await get()).status, 200);
  assert.strictEqual((await get()).status, 429, "limit is now exhausted");

  const afterLimit = await preflight();
  assert.ok(afterLimit.status < 400, `preflight must still succeed, got ${afterLimit.status}`);
  assert.ok(afterLimit.headers.get("access-control-allow-origin"));
});

test("RATE_LIMIT_MAX from the environment is applied per request, not frozen at import", async (t) => {
  t.after(() => {
    delete process.env.RATE_LIMIT_MAX;
    resetRateLimit();
  });

  // src/index.js imports app.js before dotenv.config() runs, so a limit read
  // once at import time would ignore .env entirely. Changing it here and
  // seeing the reported ceiling change proves it is read per request.
  process.env.RATE_LIMIT_MAX = "7";
  resetRateLimit();
  assert.strictEqual((await get()).headers.get("ratelimit-limit"), "7");

  process.env.RATE_LIMIT_MAX = "42";
  resetRateLimit();
  assert.strictEqual((await get()).headers.get("ratelimit-limit"), "42");

  delete process.env.RATE_LIMIT_MAX;
  resetRateLimit();
  assert.strictEqual(
    (await get()).headers.get("ratelimit-limit"),
    String(DEV_RATE_LIMIT_MAX),
    "with no override, a non-production process falls back to the development ceiling"
  );
});

test("the development default comfortably absorbs a realistic dev page load", async (t) => {
  t.after(() => resetRateLimit());
  resetRateLimit();

  // A profile page load observed in dev: ~8 endpoints, doubled by StrictMode,
  // each preceded by a preflight. Only the non-OPTIONS half is counted now.
  const requestsPerPageLoad = 8 * 2;
  assert.ok(
    DEV_RATE_LIMIT_MAX / requestsPerPageLoad >= 50,
    `the dev ceiling should allow dozens of page loads per window, allows ${DEV_RATE_LIMIT_MAX / requestsPerPageLoad}`
  );
  assert.ok(
    PROD_RATE_LIMIT_MAX / requestsPerPageLoad < 10,
    "production intentionally stays tight"
  );
});

// --- Login Rate Limiter Tests (Demo and Production Multi-User Support) -------

test("resolveLoginRateLimitKey: development keys by IP + normalized phone number", () => {
  const req1 = { ip: "127.0.0.1", body: { phone: "9876543210" } };
  const req2 = { ip: "127.0.0.1", body: { phone: "+91 98765 43210" } };
  const req3 = { ip: "127.0.0.1", body: { phone: "9123456780" } };
  const reqNoPhone = { ip: "127.0.0.1", body: {} };

  assert.strictEqual(
    resolveLoginRateLimitKey(req1, { NODE_ENV: "development" }),
    "127.0.0.1_9876543210"
  );
  assert.strictEqual(
    resolveLoginRateLimitKey(req2, { NODE_ENV: "development" }),
    "127.0.0.1_9876543210",
    "normalized phone formats must share the same key"
  );
  assert.strictEqual(
    resolveLoginRateLimitKey(req3, { NODE_ENV: "development" }),
    "127.0.0.1_9123456780",
    "different phone numbers must produce distinct keys on the same IP"
  );
  assert.strictEqual(
    resolveLoginRateLimitKey(reqNoPhone, { NODE_ENV: "development" }),
    "127.0.0.1",
    "fallback to IP if phone is missing"
  );
});

test("resolveLoginRateLimitKey: production keys strictly by IP for security", () => {
  const req = { ip: "203.0.113.195", body: { phone: "9876543210" } };
  assert.strictEqual(
    resolveLoginRateLimitKey(req, { NODE_ENV: "production" }),
    "203.0.113.195"
  );
});

const postLogin = (phone, password = "wrongpassword") =>
  fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
    },
    body: JSON.stringify({ phone, password }),
  });

test("login endpoint allows multiple demo accounts from the same IP without cross-account lockout", async (t) => {
  const userFindMock = mock.method(User, "findOne", async () => null);
  t.after(() => {
    userFindMock.mock.restore();
    resetRateLimit();
  });
  resetRateLimit();

  const userAPhone = "9876543201";
  const userBPhone = "9876543202";
  const userCPhone = "9876543203";

  // Simulate 3 attempts for User A, 3 attempts for User B, 3 attempts for User C
  for (let i = 0; i < 3; i++) {
    const resA = await postLogin(userAPhone);
    assert.notStrictEqual(resA.status, 429, `User A attempt ${i + 1} should not be 429`);

    const resB = await postLogin(userBPhone);
    assert.notStrictEqual(resB.status, 429, `User B attempt ${i + 1} should not be 429`);

    const resC = await postLogin(userCPhone);
    assert.notStrictEqual(resC.status, 429, `User C attempt ${i + 1} should not be 429`);
  }
});

test("login endpoint still rate limits repeated failed attempts on the same phone number", async (t) => {
  const userFindMock = mock.method(User, "findOne", async () => null);
  t.after(() => {
    userFindMock.mock.restore();
    resetRateLimit();
  });
  resetRateLimit();

  const targetPhone = "9998887776";

  // Send 5 failed attempts (max is 5)
  for (let i = 0; i < 5; i++) {
    const res = await postLogin(targetPhone);
    assert.notStrictEqual(res.status, 429, `Attempt ${i + 1} within quota`);
  }

  // 6th attempt should be blocked with 429
  const blocked = await postLogin(targetPhone);
  assert.strictEqual(blocked.status, 429, "6th attempt on the same account must be rate limited");
  const body = await blocked.json();
  assert.match(body.message, /too many login attempts/i);
});

test("login endpoint preflight does not consume login attempt quota", async (t) => {
  const userFindMock = mock.method(User, "findOne", async () => null);
  t.after(() => {
    userFindMock.mock.restore();
    resetRateLimit();
  });
  resetRateLimit();

  const preflightLogin = () =>
    fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

  // Issue 15 preflights
  for (let i = 0; i < 15; i++) {
    const res = await preflightLogin();
    assert.ok(res.status < 400, "preflight must succeed");
  }

  // Next normal attempt should succeed without 429
  const phone = "9112233445";
  const res = await postLogin(phone);
  assert.notStrictEqual(res.status, 429, "preflights must not consume login quota");
});
