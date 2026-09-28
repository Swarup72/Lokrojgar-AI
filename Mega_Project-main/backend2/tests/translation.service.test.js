import test from "node:test";
import assert from "node:assert";

process.env.AI_SERVICE_URL = "http://test-ai:9000";

const { translateTextToAllLanguages } = await import("../src/services/translation.service.js");

/**
 * translation.service.js is now a thin HTTP wrapper around FastAPI's
 * /translation/translate - the actual translation logic (BCP-47 language
 * mapping, direct-not-chained translation) moved to the Python ai-service
 * and is covered there (ai-service/tests/test_translator.py). These tests
 * only cover what translation.service.js itself is still responsible for:
 * the empty-text short-circuit, passing text/sourceLang through correctly,
 * and falling back to source-text passthrough on ANY AI-service failure
 * (unset key, unreachable service, or a genuine provider error).
 *
 * translateText is a plain ESM named export, so it can't be mock.method()'d
 * directly - mocking global.fetch instead, same technique used elsewhere.
 */

function mockFetchOnce(handler) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = originalFetch;
  };
}

test("successful translation returns the AI service's {mr, hi, en} response", async () => {
  let capturedBody;
  const restore = mockFetchOnce(async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ en: "Hello", hi: "नमस्ते", mr: "नमस्कार" }) };
  });

  try {
    const result = await translateTextToAllLanguages("Hello", "en");

    assert.deepStrictEqual(result, { en: "Hello", hi: "नमस्ते", mr: "नमस्कार" });
    assert.strictEqual(capturedBody.text, "Hello");
    assert.strictEqual(capturedBody.source_lang, "en");
  } finally {
    restore();
  }
});

test("defaults sourceLang to 'en' when not provided", async () => {
  let capturedBody;
  const restore = mockFetchOnce(async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ en: "Hello", hi: "x", mr: "y" }) };
  });

  try {
    await translateTextToAllLanguages("Hello");
    assert.strictEqual(capturedBody.source_lang, "en");
  } finally {
    restore();
  }
});

test("empty text returns immediately without calling the AI service", async () => {
  const restore = mockFetchOnce(async () => {
    throw new Error("should not be called");
  });

  try {
    const result = await translateTextToAllLanguages("", "en");
    assert.deepStrictEqual(result, { mr: "", hi: "", en: "" });
  } finally {
    restore();
  }
});

test("whitespace-only text returns immediately without calling the AI service", async () => {
  const restore = mockFetchOnce(async () => {
    throw new Error("should not be called");
  });

  try {
    const result = await translateTextToAllLanguages("   ", "en");
    // Matches the existing (pre-migration) early-return behavior exactly:
    // whitespace-only source text is passed through as-is, untrimmed.
    assert.strictEqual(result.en, "   ");
    assert.strictEqual(result.hi, "");
    assert.strictEqual(result.mr, "");
  } finally {
    restore();
  }
});

test("AI service explicit 503 falls back uniformly to source text for all languages", async () => {
  const restore = mockFetchOnce(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ detail: "Sarvam AI is not configured (SARVAM_API_KEY missing)." }),
  }));

  try {
    const result = await translateTextToAllLanguages("Hello", "en");
    assert.deepStrictEqual(result, { mr: "Hello", hi: "Hello", en: "Hello" });
  } finally {
    restore();
  }
});

test("AI service unreachable (network error, no statusCode) falls back uniformly to source text", async () => {
  const restore = mockFetchOnce(async () => {
    throw new Error("fetch failed");
  });

  try {
    const result = await translateTextToAllLanguages("Hello", "en");
    assert.deepStrictEqual(result, { mr: "Hello", hi: "Hello", en: "Hello" });
  } finally {
    restore();
  }
});

test("a genuine provider error (non-503 failure) also falls back uniformly, never partially", async () => {
  const restore = mockFetchOnce(async () => ({
    ok: false,
    status: 502,
    json: async () => ({ detail: "upstream failure" }),
  }));

  try {
    const result = await translateTextToAllLanguages("Hello", "en");
    assert.deepStrictEqual(result, { mr: "Hello", hi: "Hello", en: "Hello" });
  } finally {
    restore();
  }
});

test("Marathi source text falls back with itself as the source-language slot", async () => {
  const restore = mockFetchOnce(async () => ({ ok: false, status: 503, json: async () => ({}) }));

  try {
    const result = await translateTextToAllLanguages("नमस्कार", "mr");
    assert.deepStrictEqual(result, { mr: "नमस्कार", hi: "नमस्कार", en: "नमस्कार" });
  } finally {
    restore();
  }
});
