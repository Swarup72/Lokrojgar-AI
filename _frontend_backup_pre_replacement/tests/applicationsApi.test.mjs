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
let applications;
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
  applications = await vite.ssrLoadModule("/src/api/applications.js");
});

after(async () => {
  for (const socket of sockets) socket.destroy();
  server.close();
  await vite.close();
});

test("applications.apply issues POST /applications/apply with payload", async () => {
  recordedRequests.length = 0;
  const payload = { jobId: "JOB123", coverNote: "Experienced plumber" };
  const result = await applications.apply(payload);
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "POST");
  assert.strictEqual(recordedRequests[0].url, "/applications/apply");
  assert.deepStrictEqual(recordedRequests[0].body, payload);
});

test("applications.withdraw issues POST /applications/:id/withdraw", async () => {
  recordedRequests.length = 0;
  const result = await applications.withdraw("APP123");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "POST");
  assert.strictEqual(recordedRequests[0].url, "/applications/APP123/withdraw");
});

test("applications.getMine issues GET /applications/mine", async () => {
  recordedRequests.length = 0;
  const result = await applications.getMine();
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "GET");
  assert.strictEqual(recordedRequests[0].url, "/applications/mine");
});

test("applications.getForJob issues GET /applications/job/:jobId", async () => {
  recordedRequests.length = 0;
  const result = await applications.getForJob("JOB123");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "GET");
  assert.strictEqual(recordedRequests[0].url, "/applications/job/JOB123");
});

test("applications.getById issues GET /applications/:applicationId", async () => {
  recordedRequests.length = 0;
  const result = await applications.getById("APP123");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "GET");
  assert.strictEqual(recordedRequests[0].url, "/applications/APP123");
});

test("applications.shortlist issues PATCH /applications/:id/shortlist", async () => {
  recordedRequests.length = 0;
  const result = await applications.shortlist("APP123");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "PATCH");
  assert.strictEqual(recordedRequests[0].url, "/applications/APP123/shortlist");
});

test("applications.setStatus issues PATCH /applications/:id/status with { status }", async () => {
  recordedRequests.length = 0;
  const result = await applications.setStatus("APP123", "accepted");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "PATCH");
  assert.strictEqual(recordedRequests[0].url, "/applications/APP123/status");
  assert.deepStrictEqual(recordedRequests[0].body, { status: "accepted" });
});

test("applications.complete issues PATCH /applications/:id/complete", async () => {
  recordedRequests.length = 0;
  const result = await applications.complete("APP123");
  assert.strictEqual(result.mockResult, true);
  assert.strictEqual(recordedRequests.length, 1);
  assert.strictEqual(recordedRequests[0].method, "PATCH");
  assert.strictEqual(recordedRequests[0].url, "/applications/APP123/complete");
});
