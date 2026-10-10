// H-5: the shared Axios client must give every request a finite timeout,
// report a timeout distinctly from ordinary HTTP errors, and give the
// AI-backed requests a budget longer than the backend's own AI timeouts.
//
// The real src/ modules are loaded through Vite's own module loader (so
// import.meta.env and extensionless imports resolve exactly as in the app),
// and requests go to real local HTTP servers through Axios' real adapter -
// the timeout under test is Axios' own, not a mock of it.
import test, { after, before } from "node:test";
import assert from "node:assert";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const store = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
});
globalThis.window = { dispatchEvent: () => true };

const BACKEND_AI_INFERENCE_TIMEOUT_MS = 300_000; // backend2 DEFAULT_AI_SERVICE_INFERENCE_TIMEOUT_MS

let vite;
let client;
let clientModule;
let voiceProfile;
let jobs;
let recommendations;
let applications;
let errorMessages;
let en;
let baseUrl;
let requestCount = 0;
const sockets = new Set();
let server;

before(async () => {
  server = http.createServer((req, res) => {
    requestCount += 1;
    if (req.url.startsWith("/ok")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { ok: true } }));
    } else if (req.url.startsWith("/slow")) {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: { slow: true } }));
      }, 30);
    } else if (req.url.startsWith("/status/")) {
      const status = Number(req.url.split("/")[2].split("?")[0]);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `status ${status}` }));
    }
    // "/hang": accept the request, never respond.
  });
  server.on("connection", (socket) => sockets.add(socket));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  vite = await createServer({
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  clientModule = await vite.ssrLoadModule("/src/api/client.js");
  client = clientModule.default;
  voiceProfile = await vite.ssrLoadModule("/src/api/voiceProfile.js");
  jobs = await vite.ssrLoadModule("/src/api/jobs.js");
  recommendations = await vite.ssrLoadModule("/src/api/recommendations.js");
  applications = await vite.ssrLoadModule("/src/api/applications.js");
  errorMessages = await vite.ssrLoadModule("/src/utils/errorMessages.js");
  en = (await vite.ssrLoadModule("/src/context/translations/en.js")).default;
});

after(async () => {
  for (const socket of sockets) socket.destroy();
  server.close();
  await vite.close();
});

// --- 1. Timeout is configured on the real instance -------------------------

test("H-5: the shared Axios instance has a finite default timeout of 30s", () => {
  assert.strictEqual(clientModule.REQUEST_TIMEOUT_MS, 30_000);
  assert.strictEqual(client.defaults.timeout, clientModule.REQUEST_TIMEOUT_MS);
});

test("H-5: the AI request budget is finite and outlasts the backend's own AI timeouts", () => {
  const aiTimeout = clientModule.AI_REQUEST_TIMEOUT_MS;
  assert.ok(Number.isFinite(aiTimeout));
  // voice confirm can make two sequential local-model calls on the backend
  assert.ok(aiTimeout > 2 * BACKEND_AI_INFERENCE_TIMEOUT_MS);
});

test("H-5: the instance default (not just a per-request option) actually terminates a hung request", async () => {
  const original = client.defaults.timeout;
  client.defaults.timeout = 100;
  try {
    const before = requestCount;
    const started = Date.now();
    await assert.rejects(client.get(`${baseUrl}/hang`), (err) => err.isTimeout === true && err.status === null);
    assert.ok(Date.now() - started < 2000);
    assert.strictEqual(requestCount - before, 1, "no automatic retry after a timeout");
  } finally {
    client.defaults.timeout = original;
  }
});

// --- 2. Successful requests ------------------------------------------------

test("H-5: a normal request still succeeds", async () => {
  const response = await client.get(`${baseUrl}/ok`);
  assert.deepStrictEqual(response.data, { data: { ok: true } });
});

test("H-5: a slow-but-under-timeout request still succeeds", async () => {
  const response = await client.get(`${baseUrl}/slow`, { timeout: 1000 });
  assert.deepStrictEqual(response.data, { data: { slow: true } });
});

// --- 3. Timeout ------------------------------------------------------------

test("H-5: a hung backend request rejects with a normalized timeout error", async () => {
  const started = Date.now();
  await assert.rejects(client.get(`${baseUrl}/hang`, { timeout: 100 }), (err) => {
    assert.strictEqual(err.status, null);
    assert.strictEqual(err.isNetworkError, true);
    assert.strictEqual(err.isTimeout, true);
    return true;
  });
  assert.ok(Date.now() - started < 2000);
});

// --- 4. Error specificity --------------------------------------------------

for (const status of [400, 404, 409, 500, 503]) {
  test(`H-5: an HTTP ${status} is not classified as a timeout`, async () => {
    await assert.rejects(client.get(`${baseUrl}/status/${status}`), (err) => {
      assert.strictEqual(err.status, status);
      assert.strictEqual(err.isTimeout, false);
      assert.strictEqual(err.isNetworkError, false);
      return true;
    });
  });
}

test("H-5: a refused connection is a network error, not a timeout", async () => {
  const closed = http.createServer();
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const deadUrl = `http://127.0.0.1:${closed.address().port}`;
  await new Promise((resolve) => closed.close(resolve));

  await assert.rejects(client.get(`${deadUrl}/ok`), (err) => err.isNetworkError === true && err.isTimeout === false);
});

test("H-5: friendly copy says 'took too long' for a timeout and keeps the existing copy otherwise", () => {
  // The mapper now returns a translation KEY so error copy can appear in the
  // user's language; resolving it through the English dictionary asserts the
  // same wording guarantee as before, and additionally proves the key exists.
  const { mapErrorToMessageKey } = errorMessages;
  const copy = (...args) => {
    const key = mapErrorToMessageKey(...args);
    assert.ok(key in en, `error key "${key}" is not defined in en.js`);
    return en[key];
  };
  assert.match(copy({ status: null, isNetworkError: true, isTimeout: true }), /took too long/);
  assert.match(copy({ status: null, isNetworkError: true, isTimeout: true }, "voice"), /took too long/);
  assert.match(copy({ status: null, isNetworkError: true, isTimeout: false }), /Unable to connect/);
  assert.match(copy({ status: 503, isNetworkError: false, isTimeout: false }), /temporarily unavailable/);
});

// --- 5. Which requests get which budget ------------------------------------

async function capturedTimeout(invoke) {
  const originalAdapter = client.defaults.adapter;
  let timeout;
  client.defaults.adapter = async (config) => {
    timeout = config.timeout;
    return { data: { data: {} }, status: 200, statusText: "OK", headers: {}, config };
  };
  try {
    await invoke();
  } finally {
    client.defaults.adapter = originalAdapter;
  }
  return timeout;
}

const AI_BACKED = [
  ["voiceProfile.extract", () => voiceProfile.extract(new Blob(["x"], { type: "audio/wav" }), "mr")],
  ["voiceProfile.confirm", () => voiceProfile.confirm("VP1", { fullName: "A" })],
  ["jobs.create", () => jobs.create({ title: { en: "Plumber" } })],
];
const ORDINARY = [
  ["recommendations.getRecommendedJobs", () => recommendations.getRecommendedJobs()],
  ["recommendations.getRecommendedWorkers", () => recommendations.getRecommendedWorkers("JOB1")],
  ["applications.apply", () => applications.apply({ jobId: "JOB1" })],
];

for (const [name, invoke] of AI_BACKED) {
  test(`H-5: ${name} uses the long AI request timeout`, async () => {
    assert.strictEqual(await capturedTimeout(invoke), clientModule.AI_REQUEST_TIMEOUT_MS);
  });
}

for (const [name, invoke] of ORDINARY) {
  test(`H-5: ${name} uses the ordinary finite timeout`, async () => {
    assert.strictEqual(await capturedTimeout(invoke), clientModule.REQUEST_TIMEOUT_MS);
  });
}

// --- Refresh-token call ----------------------------------------------------

test("H-5: the token-refresh call (which bypasses the shared instance) also has a finite timeout", async () => {
  const { default: axios } = await import("axios");
  store.set("lokrozgar.accessToken", "expired");
  store.set("lokrozgar.refreshToken", "refresh");

  const originalClientAdapter = client.defaults.adapter;
  const originalGlobalAdapter = axios.defaults.adapter;
  let refreshTimeout;
  client.defaults.adapter = async (config) => {
    const error = new Error("Unauthorized");
    error.config = config;
    error.response = { status: 401, data: {}, config };
    throw error;
  };
  axios.defaults.adapter = async (config) => {
    refreshTimeout = config.timeout;
    throw Object.assign(new Error("timeout"), { code: "ECONNABORTED", config });
  };
  try {
    await assert.rejects(client.get("/users/me"));
    assert.strictEqual(refreshTimeout, clientModule.REQUEST_TIMEOUT_MS);
  } finally {
    client.defaults.adapter = originalClientAdapter;
    axios.defaults.adapter = originalGlobalAdapter;
    store.clear();
  }
});
