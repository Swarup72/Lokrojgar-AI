import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import { mock } from "node:test";
import {
  getRecommendedJobsForWorker,
  getRecommendedWorkersForJob,
  scoreWorkerJobPair,
  forwardAudioForExtraction,
  translateText,
  resolveSkillsSemantically,
  AiServiceTimeoutError,
  DEFAULT_AI_SERVICE_TIMEOUT_MS,
  DEFAULT_AI_SERVICE_INFERENCE_TIMEOUT_MS,
} from "../src/services/aiService.client.js";
import { processVoiceProfileAudio, AiServiceUnavailableError } from "../src/services/ai.service.js";
import { translateTextToAllLanguages } from "../src/services/translation.service.js";

// H-5: every Node -> AI-service call must have a finite timeout, with the
// longer inference budget only on the local-model endpoints.

const AI_CALLS = [
  { name: "getRecommendedJobsForWorker", call: () => getRecommendedJobsForWorker({ worker: {}, jobs: [] }), budget: "standard" },
  { name: "getRecommendedWorkersForJob", call: () => getRecommendedWorkersForJob({ job: {}, workers: [] }), budget: "standard" },
  { name: "scoreWorkerJobPair", call: () => scoreWorkerJobPair({ worker: {}, job: {} }), budget: "standard" },
  { name: "translateText", call: () => translateText({ text: "hi", sourceLang: "en" }), budget: "standard" },
  {
    name: "forwardAudioForExtraction",
    call: () =>
      forwardAudioForExtraction({ audioBuffer: Buffer.from("x"), filename: "a.wav", contentType: "audio/wav", language: "mr" }),
    budget: "inference",
  },
  {
    name: "resolveSkillsSemantically",
    call: () => resolveSkillsSemantically({ transcript: "", rawSkills: ["x"], catalog: [] }),
    budget: "inference",
  },
];

function withEnv(t, vars) {
  const previous = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function withFetch(t, fakeFetch) {
  const originalFetch = global.fetch;
  global.fetch = fakeFetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
}

// A fetch that never answers on its own - it only settles when the signal
// it was given aborts, exactly like a real hung connection.
function hangingFetch(calls) {
  return (url, options) => {
    calls.push({ url, options });
    return new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason));
    });
  };
}

// A real local HTTP server that accepts the request and never responds.
async function startHangingServer(t) {
  const sockets = new Set();
  const server = http.createServer(() => {});
  server.on("connection", (socket) => sockets.add(socket));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

// --- 1. Timeout is configured AND actually applied to the fetch call ------

for (const { name, call, budget } of AI_CALLS) {
  test(`H-5: ${name} passes a ${budget} timeout signal to fetch`, async (t) => {
    withEnv(t, { AI_SERVICE_TIMEOUT_MS: undefined, AI_SERVICE_INFERENCE_TIMEOUT_MS: undefined });
    const timeoutMock = mock.method(AbortSignal, "timeout");
    t.after(() => timeoutMock.mock.restore());
    let fetchSignal;
    withFetch(t, async (url, options) => {
      fetchSignal = options.signal;
      return { ok: true, json: async () => ({}) };
    });

    await call();

    const expected = budget === "inference" ? DEFAULT_AI_SERVICE_INFERENCE_TIMEOUT_MS : DEFAULT_AI_SERVICE_TIMEOUT_MS;
    assert.strictEqual(timeoutMock.mock.callCount(), 1);
    assert.strictEqual(timeoutMock.mock.calls[0].arguments[0], expected);
    assert.strictEqual(fetchSignal, timeoutMock.mock.calls[0].result, "the timeout signal must be the one handed to fetch");
    assert.ok(Number.isFinite(expected) && expected > 0);
  });
}

test("H-5: defaults are 30s for standard calls and 300s for local-model inference", () => {
  assert.strictEqual(DEFAULT_AI_SERVICE_TIMEOUT_MS, 30_000);
  assert.strictEqual(DEFAULT_AI_SERVICE_INFERENCE_TIMEOUT_MS, 300_000);
  assert.ok(DEFAULT_AI_SERVICE_INFERENCE_TIMEOUT_MS > DEFAULT_AI_SERVICE_TIMEOUT_MS);
});

test("H-5: AI_SERVICE_TIMEOUT_MS / AI_SERVICE_INFERENCE_TIMEOUT_MS override the defaults", async (t) => {
  withEnv(t, { AI_SERVICE_TIMEOUT_MS: "1234", AI_SERVICE_INFERENCE_TIMEOUT_MS: "5678" });
  const timeoutMock = mock.method(AbortSignal, "timeout");
  t.after(() => timeoutMock.mock.restore());
  withFetch(t, async () => ({ ok: true, json: async () => ({}) }));

  await getRecommendedWorkersForJob({ job: {}, workers: [] });
  await resolveSkillsSemantically({ transcript: "", rawSkills: ["x"], catalog: [] });

  assert.deepStrictEqual(
    timeoutMock.mock.calls.map((c) => c.arguments[0]),
    [1234, 5678]
  );
});

for (const bad of ["", "0", "-5", "abc"]) {
  test(`H-5: an invalid timeout env value (${JSON.stringify(bad)}) falls back to the finite default`, async (t) => {
    withEnv(t, { AI_SERVICE_TIMEOUT_MS: bad });
    const timeoutMock = mock.method(AbortSignal, "timeout");
    t.after(() => timeoutMock.mock.restore());
    withFetch(t, async () => ({ ok: true, json: async () => ({}) }));

    await translateText({ text: "hi", sourceLang: "en" });

    assert.strictEqual(timeoutMock.mock.calls[0].arguments[0], DEFAULT_AI_SERVICE_TIMEOUT_MS);
  });
}

// --- 2. Successful request below the timeout ------------------------------

test("H-5: a response that arrives before the timeout still succeeds unchanged", async (t) => {
  withEnv(t, { AI_SERVICE_TIMEOUT_MS: "1000" });
  withFetch(t, async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true, json: async () => ({ anchor_id: "JOB001", direction: "job_to_workers", matches: [] }) };
  });

  const result = await getRecommendedWorkersForJob({ job: {}, workers: [] });

  assert.deepStrictEqual(result, { anchor_id: "JOB001", direction: "job_to_workers", matches: [] });
});

// --- 3. Timeout terminates the request ------------------------------------

test("H-5: a hung AI service (mocked fetch) rejects with AiServiceTimeoutError instead of pending forever", async (t) => {
  withEnv(t, { AI_SERVICE_TIMEOUT_MS: "25" });
  const calls = [];
  withFetch(t, hangingFetch(calls));

  const started = Date.now();
  await assert.rejects(
    () => getRecommendedWorkersForJob({ job: {}, workers: [] }),
    (err) => {
      assert.ok(err instanceof AiServiceTimeoutError);
      assert.strictEqual(err.isTimeout, true);
      assert.strictEqual(err.path, "/recommendations/workers-for-job");
      assert.strictEqual(err.timeoutMs, 25);
      assert.strictEqual(err.statusCode, undefined, "no HTTP status - the service never answered");
      assert.match(err.message, /timed out after 25ms/);
      return true;
    }
  );
  assert.ok(Date.now() - started < 2000);
  assert.strictEqual(calls.length, 1, "no automatic retry after a timeout");
});

test("H-5: a real hung HTTP server is cut off by the timeout (real fetch, no mocks)", async (t) => {
  const url = await startHangingServer(t);
  withEnv(t, { AI_SERVICE_URL: url, AI_SERVICE_INFERENCE_TIMEOUT_MS: "100" });

  const started = Date.now();
  await assert.rejects(
    () => resolveSkillsSemantically({ transcript: "", rawSkills: ["x"], catalog: [] }),
    (err) => err instanceof AiServiceTimeoutError && err.path === "/skills/resolve" && err.timeoutMs === 100
  );
  assert.ok(Date.now() - started < 2000);
});

test("H-5: a response whose body stalls after the headers is also cut off", async (t) => {
  withEnv(t, { AI_SERVICE_TIMEOUT_MS: "25" });
  withFetch(t, async (url, options) => ({
    ok: true,
    json: () =>
      new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason));
      }),
  }));

  await assert.rejects(() => translateText({ text: "hi", sourceLang: "en" }), AiServiceTimeoutError);
});

// --- 4. Ordinary errors are not misclassified as timeouts ------------------

for (const status of [400, 404, 422, 500, 503]) {
  test(`H-5: an HTTP ${status} from the AI service is not reported as a timeout`, async (t) => {
    withFetch(t, async () => ({ ok: false, status, json: async () => ({ detail: "boom" }) }));

    await assert.rejects(
      () => getRecommendedJobsForWorker({ worker: {}, jobs: [] }),
      (err) => {
        assert.strictEqual(err.statusCode, status);
        assert.ok(!(err instanceof AiServiceTimeoutError));
        assert.notStrictEqual(err.isTimeout, true);
        return true;
      }
    );
  });
}

test("H-5: a connection failure is not reported as a timeout", async (t) => {
  withFetch(t, async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(
    () => scoreWorkerJobPair({ worker: {}, job: {} }),
    (err) => err instanceof TypeError && err.isTimeout !== true
  );
});

// --- 5. Existing callers keep their "AI unavailable" handling --------------

test("H-5: a voice extraction timeout surfaces as the existing AiServiceUnavailableError (-> 503)", async (t) => {
  withEnv(t, { AI_SERVICE_INFERENCE_TIMEOUT_MS: "25" });
  const calls = [];
  withFetch(t, hangingFetch(calls));
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const audioPath = path.join(os.tmpdir(), `h5-timeout-${process.pid}.wav`);
  fs.writeFileSync(audioPath, "fake-audio");
  t.after(() => fs.rmSync(audioPath, { force: true }));

  await assert.rejects(() => processVoiceProfileAudio(audioPath, "mr"), AiServiceUnavailableError);
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/voice/extract"));
});

test("H-5: a recommendation timeout reaches the user as the existing 503, not a hang or a 500", async (t) => {
  withEnv(t, { AI_SERVICE_TIMEOUT_MS: "25" });
  const calls = [];
  withFetch(t, hangingFetch(calls));
  const { default: Job } = await import("../src/models/job.model.js");
  const { default: EmployerProfile } = await import("../src/models/employerProfile.model.js");
  const { default: WorkerProfile } = await import("../src/models/workerProfile.model.js");
  const { default: WorkerSkill } = await import("../src/models/workerSkill.model.js");
  const { getRecommendedWorkers } = await import("../src/controllers/job.controller.js");
  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => ({ _id: "EMP1" })),
    mock.method(Job, "findOne", () => ({ populate: async () => ({ _id: "JOB1", employerId: "EMP1", status: "open", skillIds: [] }) })),
    mock.method(WorkerProfile, "find", () => ({ limit: async () => [{ _id: "W1" }] })),
    mock.method(WorkerSkill, "find", async () => []),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const nextError = await new Promise((resolve) => {
    const res = { status: () => res, json: () => resolve(null) };
    getRecommendedWorkers({ user: { _id: "U1" }, params: { jobId: "JOB1" } }, res, resolve);
  });

  assert.strictEqual(nextError.statusCode, 503);
  assert.match(nextError.message, /unavailable/);
  assert.strictEqual(calls.length, 1, "no automatic retry");
});

test("H-5: a translation timeout still falls back to source text, so job creation is not blocked", async (t) => {
  withEnv(t, { AI_SERVICE_TIMEOUT_MS: "25" });
  withFetch(t, hangingFetch([]));

  const result = await translateTextToAllLanguages("Plumber needed", "en");

  assert.deepStrictEqual(result, { mr: "Plumber needed", hi: "Plumber needed", en: "Plumber needed" });
});
