import test from "node:test";
import assert from "node:assert";

/**
 * Guided Voice Employer Profile: frontend API and wire contract tests.
 *
 * Verifies that employer guided sessions pass role="employer" cleanly across
 * start, draft lookup, step submission, discard, and profile confirmation,
 * and verifies translation parity for employer-specific voice keys.
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

// --- Employer Guided Session API Tests ---------------------------------------

test("Employer: starting a guided session sends language and role='employer'", async () => {
  const config = await capture(() => voiceApi.startGuided("mr", "employer"), {
    data: { data: { steps: ["fullName", "businessName", "businessType", "city"], role: "employer" } },
  });
  assert.strictEqual(config.method, "post");
  assert.ok(config.url.endsWith("/voice-profile/guided/start"), `unexpected url: ${config.url}`);
  assert.deepStrictEqual(bodyOf(config), { language: "mr", role: "employer" });
});

test("Employer: reading draft passes language and role='employer' as query params", async () => {
  const config = await capture(() => voiceApi.getGuidedDraft("hi", "employer"), {
    data: { data: null },
  });
  assert.strictEqual(config.method, "get");
  assert.ok(config.url.endsWith("/voice-profile/guided/draft"), `unexpected url: ${config.url}`);
  assert.deepStrictEqual(config.params, { language: "hi", role: "employer" });
});

for (const field of ["fullName", "businessName", "businessType", "city"]) {
  test(`Employer: voice step posts audio + language + field="${field}" + role="employer"`, async () => {
    const blob = new Blob([Buffer.from([1, 2, 3])], { type: "audio/webm" });
    const config = await capture(() => voiceApi.submitGuidedStep(blob, "mr", field, "employer"), {
      data: { data: { field, ok: true, value: "test" } },
    });

    assert.strictEqual(config.method, "post");
    assert.ok(config.url.endsWith("/voice-profile/guided/step"), `unexpected url: ${config.url}`);
    assert.strictEqual(config.data.get("field"), field);
    assert.strictEqual(config.data.get("language"), "mr");
    assert.strictEqual(config.data.get("role"), "employer");
    assert.ok(config.data.get("audio"));
    assert.strictEqual(config.timeout, clientMod.AI_REQUEST_TIMEOUT_MS);
  });
}

test("Employer: patching a field sends language, field, value, and role='employer'", async () => {
  const config = await capture(() => voiceApi.setGuidedField("en", "businessName", "Shree Ganesh Farms", "employer"), {
    data: { data: { field: "businessName" } },
  });

  assert.strictEqual(config.method, "patch");
  assert.ok(config.url.endsWith("/voice-profile/guided/step"), `unexpected url: ${config.url}`);
  assert.deepStrictEqual(bodyOf(config), {
    language: "en",
    field: "businessName",
    value: "Shree Ganesh Farms",
    role: "employer",
  });
});

test("Employer: discarding a draft sends language and role='employer'", async () => {
  const config = await capture(() => voiceApi.discardGuidedDraft("mr", "employer"));
  assert.strictEqual(config.method, "delete");
  assert.ok(config.url.endsWith("/voice-profile/guided/draft"), `unexpected url: ${config.url}`);
  assert.deepStrictEqual(bodyOf(config), { language: "mr", role: "employer" });
});

test("Employer: confirming sends voiceProfileId, confirmedFields, and role='employer'", async () => {
  const confirmedFields = {
    fullName: "राजेश पाटील",
    businessName: "पाटील कन्स्ट्रक्शन्स",
    businessType: "बांधकाम कामगार",
    city: "पुणे",
  };
  const config = await capture(() => voiceApi.confirm("VP_EMP_123", confirmedFields, "employer"));

  assert.strictEqual(config.method, "post");
  assert.ok(config.url.endsWith("/voice-profile/confirm"), `unexpected url: ${config.url}`);
  const body = bodyOf(config);
  assert.strictEqual(body.voiceProfileId, "VP_EMP_123");
  assert.strictEqual(body.role, "employer");
  assert.deepStrictEqual(body.confirmedFields, confirmedFields);
});

// --- Employer Guided Localization Tests -------------------------------------

test("Employer guided keys exist in all three languages and are not English in mr/hi", () => {
  const employerKeys = [
    "voice.guided.employer.title",
    "voice.guided.employer.subtitle",
    "voice.guided.employer.fullName.label",
    "voice.guided.employer.fullName.prompt",
    "voice.guided.businessName.label",
    "voice.guided.businessName.prompt",
    "voice.guided.businessType.label",
    "voice.guided.businessType.prompt",
    "voice.guided.employer.city.label",
    "voice.guided.employer.city.prompt",
    "voice.guided.error.not_work_like",
    "voice.guided.saveEmployer",
    "voice.success.employerTitle",
    "voice.success.employerSubtitle",
    "voice.success.businessName",
    "voice.success.businessType",
    "voice.success.city",
    "voice.success.goToEmployerDashboard",
    "profile.employer.voiceBanner.title",
    "profile.employer.voiceBanner.desc",
    "profile.employer.voiceBanner.action",
  ];

  for (const key of employerKeys) {
    assert.ok(en[key], `en missing key: ${key}`);
    for (const [langName, dict] of [["mr", mr], ["hi", hi]]) {
      assert.ok(dict[key], `${langName} is missing key: ${key}`);
      assert.notStrictEqual(dict[key], en[key], `${langName}.${key} must not be plain English`);
    }
  }
});
