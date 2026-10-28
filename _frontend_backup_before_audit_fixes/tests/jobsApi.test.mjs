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

let vite;
let clientModule;
let jobs;
let server;
let baseUrl;
const recordedRequests = [];
const sockets = new Set();

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let parsedBody = null;
      if (body) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = body;
        }
      }
      recordedRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: parsedBody,
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "success",
          data: {
            mockResult: true,
            method: req.method,
            url: req.url,
            body: parsedBody,
          },
        })
      );
    });
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
  clientModule.default.defaults.baseURL = baseUrl;
  jobs = await vite.ssrLoadModule("/src/api/jobs.js");
});

after(async () => {
  for (const socket of sockets) socket.destroy();
  server.close();
  await vite.close();
});

test("jobs.getById issues GET /jobs/:jobId and unwraps data", async () => {
  recordedRequests.length = 0;
  const result = await jobs.getById("JOB12345");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "GET");
  assert.strictEqual(recordedRequests[0].url, "/jobs/JOB12345");
});

test("jobs.update issues PATCH /jobs/:jobId with payload", async () => {
  recordedRequests.length = 0;
  const payload = { experienceRequired: 2, payAmount: 500 };
  const result = await jobs.update("JOB12345", payload);
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "PATCH");
  assert.strictEqual(recordedRequests[0].url, "/jobs/JOB12345");
  assert.deepStrictEqual(recordedRequests[0].body, payload);
});

test("jobs.close issues POST /jobs/:jobId/close", async () => {
  recordedRequests.length = 0;
  const result = await jobs.close("JOB12345");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "POST");
  assert.strictEqual(recordedRequests[0].url, "/jobs/JOB12345/close");
});

test("jobs.cancel issues POST /jobs/:jobId/cancel", async () => {
  recordedRequests.length = 0;
  const result = await jobs.cancel("JOB12345");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "POST");
  assert.strictEqual(recordedRequests[0].url, "/jobs/JOB12345/cancel");
});

test("jobs.reopen issues POST /jobs/:jobId/reopen with optional deadline payload", async () => {
  recordedRequests.length = 0;
  const payload = { applicationDeadline: "2026-12-31T23:59:59.000Z" };
  const result = await jobs.reopen("JOB12345", payload);
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "POST");
  assert.strictEqual(recordedRequests[0].url, "/jobs/JOB12345/reopen");
  assert.deepStrictEqual(recordedRequests[0].body, payload);
});

test("jobs.remove issues DELETE /jobs/:jobId", async () => {
  recordedRequests.length = 0;
  const result = await jobs.remove("JOB12345");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "DELETE");
  assert.strictEqual(recordedRequests[0].url, "/jobs/JOB12345");
});

test("jobs.updateStatus issues PATCH /jobs/:jobId/status with { status }", async () => {
  recordedRequests.length = 0;
  const result = await jobs.updateStatus("JOB12345", "closed");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "PATCH");
  assert.strictEqual(recordedRequests[0].url, "/jobs/JOB12345/status");
  assert.deepStrictEqual(recordedRequests[0].body, { status: "closed" });
});

test("jobs.getEmployerMine issues GET /jobs/employer/mine", async () => {
  recordedRequests.length = 0;
  const result = await jobs.getEmployerMine();
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "GET");
  assert.strictEqual(recordedRequests[0].url, "/jobs/employer/mine");
});
