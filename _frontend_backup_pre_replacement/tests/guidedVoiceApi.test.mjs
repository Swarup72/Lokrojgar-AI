import test from "node:test";
import assert from "node:assert";

/**
 * Guided voice profile: wire contract and translation coverage.
 *
 * What these pin down is the stuff that only breaks in front of a real worker:
 * the exact multipart field names, that a tap step sends no audio, that the quick
 * flow's own endpoint is untouched, and that both flows end on the SAME confirm
 * call rather than two divergent commit paths.
 */

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
let clientMod;
let voiceApi;
let en;
let mr;
let hi;

test.before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  clientMod = await vite.ssrLoadModule("/src/api/client.js");
  voiceApi = await vite.ssrLoadModule("/src/api/voiceProfile.js");
  en = (await vite.ssrLoadModule("/src/context/translations/en.js")).default;
  mr = (await vite.ssrLoadModule("/src/context/translations/mr.js")).default;
  hi = (await vite.ssrLoadModule("/src/context/translations/hi.js")).default;
});

test.after(async () => {
  await vite?.close();
});

async function capture(invoke, response = { data: { data: {} } }) {
  const client = clientMod.default;
  const original = client.defaults.adapter;
  let captured = null;
  client.defaults.adapter = async (config) => {
    captured = config;
    return { ...response, status: 200, statusText: "OK", headers: {}, config };
  };
  try {
    await invoke();
  } finally {
    client.defaults.adapter = original;
  }
  return captured;
}

const bodyOf = (config) => (typeof config.data === "string" ? JSON.parse(config.data) : config.data);

// --- A. the quick flow is untouched -----------------------------------------

test("A: the quick flow still posts one recording to /voice-profile/extract", async () => {
  const blob = new Blob([Buffer.from([1, 2, 3])], { type: "audio/webm" });
  const config = await capture(() => voiceApi.extract(blob, "mr"));

  assert.ok(config.url.endsWith("/voice-profile/extract"), `unexpected url: ${config.url}`);
  assert.strictEqual(config.method, "post");
  assert.strictEqual(config.data.get("language"), "mr");
  assert.ok(config.data.get("audio"), "the field name must stay `audio`");
  // No `field` - the quick flow extracts everything from one recording.
  assert.strictEqual(config.data.get("field"), null);
});

// --- B. guided session ------------------------------------------------------

test("B: starting a guided session sends only the SPOKEN language", async () => {
  const config = await capture(() => voiceApi.startGuided("hi"), { data: { data: { steps: [] } } });
  assert.strictEqual(config.method, "post");
  assert.ok(config.url.endsWith("/voice-profile/guided/start"), `unexpected url: ${config.url}`);
  assert.deepStrictEqual(bodyOf(config), { language: "hi" });
});

test("J: reading the draft is a GET scoped by language, with no body", async () => {
  const config = await capture(() => voiceApi.getGuidedDraft("mr"), { data: { data: null } });
  assert.strictEqual(config.method, "get");
  assert.ok(config.url.endsWith("/voice-profile/guided/draft"), `unexpected url: ${config.url}`);
  assert.deepStrictEqual(config.params, { language: "mr" });
  // No workerId anywhere: ownership is derived from the token server-side.
  assert.strictEqual(config.data, undefined);
});

for (const field of ["fullName", "expectedPay", "experienceYears", "skills", "city"]) {
  test(`a voice step posts audio + language + field="${field}"`, async () => {
    const blob = new Blob([Buffer.from([1, 2, 3])], { type: "audio/webm" });
    const config = await capture(() => voiceApi.submitGuidedStep(blob, "mr", field), {
      data: { data: { field, ok: true, value: 1 } },
    });

    assert.strictEqual(config.method, "post");
    assert.ok(config.url.endsWith("/voice-profile/guided/step"), `unexpected url: ${config.url}`);
    assert.strictEqual(config.data.get("field"), field);
    assert.strictEqual(config.data.get("language"), "mr");
    assert.ok(config.data.get("audio"));
    // A local model takes seconds; the long AI timeout must be used or the
    // browser would abort a perfectly good transcription.
    assert.strictEqual(config.timeout, clientMod.AI_REQUEST_TIMEOUT_MS);
  });
}

test("I: a tap step is a PATCH with NO audio and no multipart", async () => {
  const config = await capture(() => voiceApi.setGuidedField("mr", "languages", ["mr", "hi"]), {
    data: { data: { field: "languages" } },
  });

  assert.strictEqual(config.method, "patch");
  assert.ok(config.url.endsWith("/voice-profile/guided/step"), `unexpected url: ${config.url}`);
  const body = bodyOf(config);
  assert.deepStrictEqual(body, { language: "mr", field: "languages", value: ["mr", "hi"] });
  assert.ok(!(config.data instanceof FormData), "a tap step must never send multipart audio");
});

test("I: a tap step can send 0 and an empty array without them being stripped", async () => {
  const zero = await capture(() => voiceApi.setGuidedField("mr", "experienceYears", 0));
  assert.strictEqual(bodyOf(zero).value, 0, "0 is a real answer, not an absent one");

  const empty = await capture(() => voiceApi.setGuidedField("mr", "languages", []));
  assert.deepStrictEqual(bodyOf(empty).value, []);
});

test("K: discarding a draft is a DELETE carrying the language", async () => {
  const config = await capture(() => voiceApi.discardGuidedDraft("mr"));
  assert.strictEqual(config.method, "delete");
  assert.ok(config.url.endsWith("/voice-profile/guided/draft"), `unexpected url: ${config.url}`);
  assert.deepStrictEqual(bodyOf(config), { language: "mr" });
});

// --- W. both flows converge on ONE commit path ------------------------------

test("W: the guided flow commits through the SAME /voice-profile/confirm as the quick flow", async () => {
  const config = await capture(() =>
    voiceApi.confirm("VP1", { fullName: "स्वरूप पाल", expectedPay: 0, experienceYears: 0 })
  );

  assert.strictEqual(config.method, "post");
  assert.ok(config.url.endsWith("/voice-profile/confirm"), `unexpected url: ${config.url}`);
  const body = bodyOf(config);
  assert.strictEqual(body.voiceProfileId, "VP1");
  // 0 must survive serialization - this is the zero-value rule end to end.
  assert.strictEqual(body.confirmedFields.expectedPay, 0);
  assert.strictEqual(body.confirmedFields.experienceYears, 0);
});

test("W: there is exactly one confirm function exported, not one per flow", () => {
  const commitFunctions = Object.keys(voiceApi).filter((name) => /confirm|commit|save/i.test(name));
  assert.deepStrictEqual(commitFunctions, ["confirm"], `found several commit paths: ${commitFunctions}`);
});

// --- localization -----------------------------------------------------------

test("every guided string exists in all three languages", () => {
  const guidedKeys = Object.keys(en).filter((key) => key.startsWith("voice."));
  assert.ok(guidedKeys.length > 30, `expected the wizard to be translated, found ${guidedKeys.length} keys`);

  for (const key of guidedKeys) {
    for (const [name, dict] of [["mr", mr], ["hi", hi]]) {
      assert.ok(dict[key], `${name} is missing ${key}`);
      assert.notStrictEqual(dict[key], en[key], `${name}.${key} is still the English string`);
    }
  }
});

test("the spoken-language wording is preserved exactly", () => {
  // Deliberately NOT "Choose your language": this selects the language the
  // worker will SPEAK, which is forwarded to Whisper, not the UI language.
  assert.strictEqual(en["voice.spokenLanguage"], "Which language will you speak?");
});

test("every step has a label and a prompt in each language", () => {
  for (const field of ["fullName", "expectedPay", "experienceYears", "skills", "city", "languages", "availability"]) {
    for (const [name, dict] of [["en", en], ["mr", mr], ["hi", hi]]) {
      assert.ok(dict[`voice.guided.${field}.label`], `${name} missing label for ${field}`);
      assert.ok(dict[`voice.guided.${field}.prompt`], `${name} missing prompt for ${field}`);
    }
  }
});

test("every extraction failure reason has an actionable message, not a bare error", () => {
  // These reason codes come from the AI service's field extractors; a worker who
  // is told only "failed" has nothing to act on.
  for (const reason of [
    "no_speech",
    "no_number_found",
    "no_plausible_amount",
    "multiple_amounts",
    "multiple_numbers",
    "out_of_range",
    "contains_digits",
    "not_name_like",
    "not_place_like",
    "too_short",
    "too_many_words",
    "no_skills_found",
    "generic",
  ]) {
    const message = en[`voice.guided.error.${reason}`];
    assert.ok(message, `no message for reason "${reason}"`);
    assert.ok(message.length > 15, `the message for "${reason}" is too terse to act on: ${message}`);
  }
});

test("the processing copy does not promise that a step is instant", () => {
  // The local model takes seconds; pretending otherwise makes the wizard feel
  // broken and invites the worker to tap again.
  assert.match(en["voice.guided.processing"], /second/i);
});
