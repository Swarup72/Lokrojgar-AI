import test from "node:test";
import assert from "node:assert";
import {
  getRecommendedJobsForWorker,
  getRecommendedWorkersForJob,
} from "../src/services/aiService.client.js";

test("getRecommendedJobsForWorker posts to the correct endpoint with correct payload and headers", async () => {
  const originalFetch = global.fetch;
  let capturedUrl;
  let capturedOptions;

  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      json: async () => ({ anchor_id: "WORKER001", direction: "worker_to_jobs", matches: [] }),
    };
  };

  process.env.AI_SERVICE_URL = "http://test-ai:9000";
  process.env.AI_SERVICE_API_KEY = "secret123";

  try {
    const result = await getRecommendedJobsForWorker({
      worker: { _id: "WORKER001" },
      workerSkills: [],
      jobs: [{ _id: "JOB001" }],
      topK: 5,
    });

    assert.strictEqual(capturedUrl, "http://test-ai:9000/recommendations/jobs-for-worker");
    assert.strictEqual(capturedOptions.method, "POST");
    assert.strictEqual(capturedOptions.headers["X-AI-Service-Key"], "secret123");
    assert.strictEqual(capturedOptions.headers["Content-Type"], "application/json");

    const body = JSON.parse(capturedOptions.body);
    assert.strictEqual(body.top_k, 5);
    assert.deepStrictEqual(body.worker, { _id: "WORKER001" });
    assert.deepStrictEqual(body.jobs, [{ _id: "JOB001" }]);

    assert.deepStrictEqual(result, { anchor_id: "WORKER001", direction: "worker_to_jobs", matches: [] });
  } finally {
    global.fetch = originalFetch;
    delete process.env.AI_SERVICE_URL;
    delete process.env.AI_SERVICE_API_KEY;
  }
});

test("getRecommendedWorkersForJob posts to the workers-for-job endpoint", async () => {
  const originalFetch = global.fetch;
  let capturedUrl;

  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, json: async () => ({ anchor_id: "JOB001", direction: "job_to_workers", matches: [] }) };
  };
  process.env.AI_SERVICE_URL = "http://test-ai:9000";

  try {
    await getRecommendedWorkersForJob({ job: { _id: "JOB001" }, workers: [], workerSkills: [] });
    assert.strictEqual(capturedUrl, "http://test-ai:9000/recommendations/workers-for-job");
  } finally {
    global.fetch = originalFetch;
    delete process.env.AI_SERVICE_URL;
  }
});

test("client omits the API key header when none is configured", async () => {
  const originalFetch = global.fetch;
  let capturedOptions;

  global.fetch = async (url, options) => {
    capturedOptions = options;
    return { ok: true, json: async () => ({ anchor_id: "W1", direction: "worker_to_jobs", matches: [] }) };
  };
  delete process.env.AI_SERVICE_API_KEY;

  try {
    await getRecommendedJobsForWorker({ worker: {}, workerSkills: [], jobs: [] });
    assert.strictEqual("X-AI-Service-Key" in capturedOptions.headers, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("client surfaces AI service errors with the response status code and detail message", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ detail: "top_k must be a positive integer, got 0." }),
  });

  try {
    await assert.rejects(
      () => getRecommendedJobsForWorker({ worker: {}, workerSkills: [], jobs: [], topK: 0 }),
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /top_k must be a positive integer/);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("client falls back to a generic error message when the AI service response has no JSON body", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error("not json");
    },
  });

  try {
    await assert.rejects(
      () => getRecommendedWorkersForJob({ job: {}, workers: [], workerSkills: [] }),
      (err) => {
        assert.strictEqual(err.statusCode, 500);
        assert.match(err.message, /failed with status 500/);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
