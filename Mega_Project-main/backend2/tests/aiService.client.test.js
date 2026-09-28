import test from "node:test";
import assert from "node:assert";
import {
  getRecommendedJobsForWorker,
  getRecommendedWorkersForJob,
  forwardAudioForExtraction,
  translateText,
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

// --- forwardAudioForExtraction ---------------------------------------------

test("forwardAudioForExtraction posts multipart/form-data with the audio blob and language field", async () => {
  const originalFetch = global.fetch;
  let capturedUrl;
  let capturedOptions;

  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      json: async () => ({ transcript: "hello", extracted_profile: {}, confidence: 0.9 }),
    };
  };
  process.env.AI_SERVICE_URL = "http://test-ai:9000";
  process.env.AI_SERVICE_API_KEY = "secret123";

  try {
    const result = await forwardAudioForExtraction({
      audioBuffer: Buffer.from("fake-audio-bytes"),
      filename: "clip.wav",
      contentType: "audio/wav",
      language: "mr",
    });

    assert.strictEqual(capturedUrl, "http://test-ai:9000/voice/extract");
    assert.strictEqual(capturedOptions.method, "POST");
    assert.strictEqual(capturedOptions.headers["X-AI-Service-Key"], "secret123");
    // No manual Content-Type - fetch() sets the multipart boundary itself.
    assert.strictEqual("Content-Type" in capturedOptions.headers, false);

    assert.ok(capturedOptions.body instanceof FormData);
    const audioField = capturedOptions.body.get("audio");
    assert.strictEqual(audioField.name, "clip.wav");
    assert.strictEqual(audioField.type, "audio/wav");
    assert.strictEqual(Buffer.from(await audioField.arrayBuffer()).toString(), "fake-audio-bytes");
    assert.strictEqual(capturedOptions.body.get("language"), "mr");

    assert.deepStrictEqual(result, { transcript: "hello", extracted_profile: {}, confidence: 0.9 });
  } finally {
    global.fetch = originalFetch;
    delete process.env.AI_SERVICE_URL;
    delete process.env.AI_SERVICE_API_KEY;
  }
});

test("forwardAudioForExtraction surfaces AI service errors with status code", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ detail: "Sarvam AI is not configured" }),
  });

  try {
    await assert.rejects(
      () =>
        forwardAudioForExtraction({
          audioBuffer: Buffer.from("x"),
          filename: "a.wav",
          contentType: "audio/wav",
          language: "mr",
        }),
      (err) => {
        assert.strictEqual(err.statusCode, 503);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

// --- translateText ----------------------------------------------------------

test("translateText posts JSON with text and source_lang to the translation endpoint", async () => {
  const originalFetch = global.fetch;
  let capturedUrl;
  let capturedOptions;

  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, json: async () => ({ mr: "अ", hi: "आ", en: "hello" }) };
  };
  process.env.AI_SERVICE_URL = "http://test-ai:9000";

  try {
    const result = await translateText({ text: "hello", sourceLang: "en" });

    assert.strictEqual(capturedUrl, "http://test-ai:9000/translation/translate");
    assert.strictEqual(capturedOptions.headers["Content-Type"], "application/json");
    const body = JSON.parse(capturedOptions.body);
    assert.strictEqual(body.text, "hello");
    assert.strictEqual(body.source_lang, "en");
    assert.deepStrictEqual(result, { mr: "अ", hi: "आ", en: "hello" });
  } finally {
    global.fetch = originalFetch;
    delete process.env.AI_SERVICE_URL;
  }
});

test("translateText surfaces AI service errors with status code", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 502,
    json: async () => ({ detail: "upstream failure" }),
  });

  try {
    await assert.rejects(
      () => translateText({ text: "hello", sourceLang: "en" }),
      (err) => {
        assert.strictEqual(err.statusCode, 502);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
