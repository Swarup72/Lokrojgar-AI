import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";

/**
 * ai.service.js is now a thin HTTP wrapper around FastAPI's /voice/extract -
 * all transcription/extraction logic (language mapping, schema validation,
 * empty-transcript/malformed-JSON handling) moved to the Python ai-service
 * and is covered there (ai-service/tests/test_transcription.py,
 * test_extractor.py). These tests only cover what ai.service.js itself is
 * still responsible for: reading the file, building the multipart request,
 * mapping the response shape, and mapping AI-service failures to
 * AiServiceUnavailableError.
 *
 * forwardAudioForExtraction is an ESM named export (a plain function), which
 * cannot be mock.method()'d directly ("Cannot redefine property") - mocking
 * global.fetch instead, same technique already used for
 * aiService.client.test.js and getRecommendedJobsForWorker.
 */

const { processVoiceProfileAudio, AiServiceUnavailableError } = await import("../src/services/ai.service.js");

const FIXTURE_DIR = new URL("./fixtures/", import.meta.url).pathname;
const FIXTURE_WAV_PATH = path.join(FIXTURE_DIR, "voice-service-test.wav");
const FIXTURE_WEBM_PATH = path.join(FIXTURE_DIR, "voice-service-test.webm");

test.before(() => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(FIXTURE_WAV_PATH, Buffer.from("fake-wav-bytes"));
  fs.writeFileSync(FIXTURE_WEBM_PATH, Buffer.from("fake-webm-bytes"));
});

test.after(() => {
  for (const p of [FIXTURE_WAV_PATH, FIXTURE_WEBM_PATH]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

function mockFetchOnce(handler) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = originalFetch;
  };
}

test("sends the audio file's bytes, filename, content-type, and language", async () => {
  let capturedOptions;
  const restore = mockFetchOnce(async (url, options) => {
    capturedOptions = options;
    return {
      ok: true,
      json: async () => ({ transcript: "test", extracted_profile: {}, confidence: 0.9 }),
    };
  });

  try {
    await processVoiceProfileAudio(FIXTURE_WAV_PATH, "mr");

    const audioField = capturedOptions.body.get("audio");
    assert.strictEqual(audioField.name, path.basename(FIXTURE_WAV_PATH));
    assert.strictEqual(audioField.type, "audio/wav");
    assert.strictEqual(
      Buffer.from(await audioField.arrayBuffer()).toString(),
      "fake-wav-bytes"
    );
    assert.strictEqual(capturedOptions.body.get("language"), "mr");
  } finally {
    restore();
  }
});

test("resolves content-type from the file extension for a non-wav format", async () => {
  let capturedOptions;
  const restore = mockFetchOnce(async (url, options) => {
    capturedOptions = options;
    return { ok: true, json: async () => ({ transcript: "test", extracted_profile: {}, confidence: null }) };
  });

  try {
    await processVoiceProfileAudio(FIXTURE_WEBM_PATH, "mr");
    assert.strictEqual(capturedOptions.body.get("audio").type, "audio/webm");
  } finally {
    restore();
  }
});

test("returns transcript, extractedProfile, and confidence mapped from the AI service response", async () => {
  const extractedProfile = { fullName: "Rahul", skills: ["plumbing"] };
  const restore = mockFetchOnce(async () => ({
    ok: true,
    json: async () => ({ transcript: "मी राहुल आहे", extracted_profile: extractedProfile, confidence: 0.92 }),
  }));

  try {
    const result = await processVoiceProfileAudio(FIXTURE_WAV_PATH, "mr");
    assert.strictEqual(result.transcript, "मी राहुल आहे");
    assert.deepStrictEqual(result.extractedProfile, extractedProfile);
    assert.strictEqual(result.confidence, 0.92);
  } finally {
    restore();
  }
});

test("missing local file propagates the filesystem error, no fake data returned", async () => {
  await assert.rejects(() => processVoiceProfileAudio("/no/such/file.wav", "mr"));
});

test("AI service explicit 503 maps to AiServiceUnavailableError", async () => {
  const restore = mockFetchOnce(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ detail: "Sarvam AI is not configured (SARVAM_API_KEY missing)." }),
  }));

  try {
    await assert.rejects(
      () => processVoiceProfileAudio(FIXTURE_WAV_PATH, "mr"),
      (error) => error instanceof AiServiceUnavailableError
    );
  } finally {
    restore();
  }
});

test("AI service unreachable (network error, no statusCode) maps to AiServiceUnavailableError", async () => {
  const restore = mockFetchOnce(async () => {
    throw new Error("fetch failed");
  });

  try {
    await assert.rejects(
      () => processVoiceProfileAudio(FIXTURE_WAV_PATH, "mr"),
      (error) => error instanceof AiServiceUnavailableError
    );
  } finally {
    restore();
  }
});

test("a real provider/validation failure (4xx from the AI service) propagates as-is, not as AiServiceUnavailableError", async () => {
  const restore = mockFetchOnce(async () => ({
    ok: false,
    status: 422,
    json: async () => ({ detail: "Sarvam speech-to-text returned an empty transcript." }),
  }));

  try {
    await assert.rejects(
      () => processVoiceProfileAudio(FIXTURE_WAV_PATH, "mr"),
      (error) => {
        assert.strictEqual(error instanceof AiServiceUnavailableError, false);
        assert.strictEqual(error.statusCode, 422);
        return true;
      }
    );
  } finally {
    restore();
  }
});
