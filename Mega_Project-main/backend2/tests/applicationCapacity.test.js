import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";
import express from "express";
import { z } from "zod";

process.env.AI_SERVICE_URL = "http://test-ai:9000";

import Job from "../src/models/job.model.js";
import { reserveWorkerSlot, releaseWorkerSlot } from "../src/utils/jobAssignment.js";
import { validate } from "../src/middlewares/validate.middleware.js";

// Regression tests for the Applications & Hiring audit.
// Each failed before its fix.

// --- DEFECT 1 (critical): over-hire race -----------------------------------
// The accept path compared filledWorkers against requiredWorkers in JS using
// a job it had already read. Two acceptances for DIFFERENT applications both
// passed that check against the same stale count and both incremented,
// producing two accepted applications and filledWorkers=2 on a 1-slot job.
// Capacity is now claimed inside the update filter, so MongoDB decides.

test("reserveWorkerSlot refuses to claim a slot when the job is already full", async (t) => {
  const calls = [];
  const findMock = mock.method(Job, "findOneAndUpdate", async (filter, update, opts) => {
    calls.push({ filter, update, opts });
    return null; // MongoDB matched nothing -> no capacity
  });
  t.after(() => findMock.mock.restore());

  const result = await reserveWorkerSlot("JOB1");

  assert.strictEqual(result, null, "a full job must yield null, not a job document");
  // The capacity test must be in the FILTER, evaluated by MongoDB against the
  // live document - not in JS against a previously-read copy.
  assert.ok(calls[0].filter.$expr, "capacity must be enforced in the query filter");
  assert.deepStrictEqual(
    calls[0].filter.$expr,
    { $lt: [{ $ifNull: ["$filledWorkers", 0] }, "$requiredWorkers"] }
  );
  assert.strictEqual(calls[0].opts.updatePipeline, true);
});

test("reserveWorkerSlot increments and recomputes status in one atomic pipeline", async (t) => {
  let captured = null;
  const findMock = mock.method(Job, "findOneAndUpdate", async (filter, update) => {
    captured = update;
    return { _id: "JOB1", filledWorkers: 1, requiredWorkers: 1, status: "assigned" };
  });
  t.after(() => findMock.mock.restore());

  const job = await reserveWorkerSlot("JOB1");

  assert.strictEqual(job.filledWorkers, 1);
  assert.ok(Array.isArray(captured), "must be an aggregation pipeline, not a plain $inc");
  assert.deepStrictEqual(captured[0].$set.filledWorkers, {
    $add: [{ $ifNull: ["$filledWorkers", 0] }, 1],
  });
  // The status stage must run after the increment so it sees the new count.
  assert.ok(captured[1].$set.status.$cond, "status must be recomputed from the new count");
});

// --- DEFECT 2: a reservation that cannot be used must be handed back -------

test("releaseWorkerSlot returns a slot without going negative and only mid-assignment", async (t) => {
  let captured = null;
  const findMock = mock.method(Job, "findOneAndUpdate", async (filter, update) => {
    captured = { filter, update };
    return { _id: "JOB1", filledWorkers: 0, status: "open" };
  });
  t.after(() => findMock.mock.restore());

  await releaseWorkerSlot("JOB1");

  // Never resurrects a cancelled/completed job.
  assert.deepStrictEqual(captured.filter.status, { $in: ["assigned", "partially_assigned"] });
  // Never decrements below zero.
  assert.deepStrictEqual(captured.filter.$expr, { $gt: [{ $ifNull: ["$filledWorkers", 0] }, 0] });
  assert.ok(captured.update[0].$set.filledWorkers.$max, "must floor at 0");
  assert.ok(captured.update[1].$set.status.$switch, "status must be recomputed on release");
});

// --- DEFECT 3 (critical): Express 5 getter-only req.query ------------------
// validate() assigned req.query directly. Express 5 exposes it as a
// getter-only accessor, so EVERY route whose validator declares a query
// schema threw "Cannot set property query" and returned 500 - including
// GET /applications/job/:jobId for the job's own owner.

test("validate() can sanitize req.query on Express 5 without throwing", async () => {
  const app = express();
  const schema = z.object({
    query: z.object({ status: z.enum(["applied", "accepted"]).optional() }).optional(),
  });

  app.get("/probe", validate(schema), (req, res) => {
    res.status(200).json({ ok: true, status: req.query.status ?? null });
  });
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try {
    const bare = await fetch(`http://127.0.0.1:${port}/probe`);
    assert.strictEqual(bare.status, 200, "a request with no query params must not 500");

    const withQuery = await fetch(`http://127.0.0.1:${port}/probe?status=accepted`);
    const body = await withQuery.json();
    assert.strictEqual(withQuery.status, 200);
    assert.strictEqual(body.status, "accepted", "the validated query must reach the handler");

    const invalid = await fetch(`http://127.0.0.1:${port}/probe?status=bogus`);
    assert.strictEqual(invalid.status, 400, "an invalid query value is still rejected");
  } finally {
    server.close();
  }
});

test("validate() still sanitizes body and params", async () => {
  const app = express();
  app.use(express.json());
  const schema = z.object({
    body: z.object({ keep: z.string() }),
    params: z.object({ id: z.string() }),
  });
  app.post("/probe/:id", validate(schema), (req, res) =>
    res.status(200).json({ body: req.body, params: req.params })
  );
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/probe/abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keep: "yes", stripped: "no" }),
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.body.keep, "yes");
    assert.strictEqual(body.body.stripped, undefined, "unknown body fields are still stripped");
    assert.strictEqual(body.params.id, "abc");
  } finally {
    server.close();
  }
});
