import test from "node:test";
import assert from "node:assert";

// The voice-profile language selector picks the SPOKEN language, which is
// forwarded to Whisper. Its label was reworded ("Choose your language" ->
// "Which language will you speak?") because the old text read as a UI
// setting. These tests pin the wire contract that wording change must not
// disturb: the field names and the exact language value sent.

const store = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
});
globalThis.window = { dispatchEvent: () => true };

let vite;
let voiceApi;
let clientMod;

test.before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  clientMod = await vite.ssrLoadModule("/src/api/client.js");
  voiceApi = await vite.ssrLoadModule("/src/api/voiceProfile.js");
});

test.after(async () => {
  await vite?.close();
});

/** Captures the outgoing request without any network call. */
async function captureExtract(blob, language) {
  const client = clientMod.default;
  const original = client.defaults.adapter;
  let captured = null;
  client.defaults.adapter = async (config) => {
    captured = config;
    return { data: { data: { _id: "VP1" } }, status: 200, statusText: "OK", headers: {}, config };
  };
  try {
    await voiceApi.extract(blob, language);
  } finally {
    client.defaults.adapter = original;
  }
  return captured;
}

const fakeRecording = () => new Blob([Buffer.from([1, 2, 3])], { type: "audio/webm;codecs=opus" });

for (const language of ["mr", "hi", "en"]) {
  test(`voiceProfile.extract forwards the selected spoken language "${language}" unchanged`, async () => {
    const config = await captureExtract(fakeRecording(), language);

    assert.strictEqual(config.url, "/voice-profile/extract");
    assert.strictEqual(config.method, "post");
    assert.ok(config.data instanceof FormData, "must be multipart");
    assert.strictEqual(
      config.data.get("language"),
      language,
      `selecting ${language} must send exactly "${language}" to the backend`
    );
  });
}

test("the audio field name stays 'audio' (multer's uploadAudio.single('audio'))", async () => {
  const config = await captureExtract(fakeRecording(), "mr");

  const audio = config.data.get("audio");
  assert.ok(audio, "the 'audio' field must be present");
  assert.strictEqual(audio.type, "audio/webm;codecs=opus", "the browser's recording MIME type is passed through");
});

test("extract still uses the long AI timeout, not the ordinary one", async () => {
  const config = await captureExtract(fakeRecording(), "mr");

  assert.strictEqual(config.timeout, clientMod.AI_REQUEST_TIMEOUT_MS);
  assert.ok(config.timeout > clientMod.REQUEST_TIMEOUT_MS);
});
