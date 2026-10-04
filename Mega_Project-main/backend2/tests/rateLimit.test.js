import test from "node:test";
import assert from "node:assert";
import { app } from "../src/app.js";
import {
  DEV_RATE_LIMIT_MAX,
  PROD_RATE_LIMIT_MAX,
  globalRateLimiter,
  resolveRateLimitMax,
} from "../src/middlewares/rateLimiter.middleware.js";

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
  for (const key of ["::1", "::ffff:127.0.0.1", "127.0.0.1"]) {
    globalRateLimiter.resetKey(key);
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
