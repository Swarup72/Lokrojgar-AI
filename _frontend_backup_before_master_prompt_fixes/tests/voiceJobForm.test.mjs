import test from "node:test";
import assert from "node:assert";
/**
 * The handover from the voice wizard to the Add Job form.
 *
 * This is the boundary where a spoken answer becomes something the employer is
 * about to publish, so it is where an invented value would do real damage. The
 * rules it pins:
 *
 *   - an UNANSWERED step contributes nothing, so the form shows a blank the
 *     employer fills in rather than a value nobody supplied;
 *   - only skills the backend resolved to real catalog ids are preselected —
 *     an unrecognised phrase is never guessed into an id;
 *   - the spoken language becomes originalLanguage, which is what the backend
 *     translates away from;
 *   - the mapping never emits a `status`, so it cannot make a job live.
 */

let toFormValues;
let voiceJobApi;
let vite;

test.before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  ({ toFormValues } = await vite.ssrLoadModule("/src/utils/voiceJobToForm.js"));
  voiceJobApi = await vite.ssrLoadModule("/src/api/voiceJob.js");
});

test.after(async () => {
  await vite?.close();
});

// --- the worked example, end to end ----------------------------------------

test("a fully answered Marathi draft maps onto the job form", () => {
  const values = toFormValues(
    {
      jobTitle: "इलेक्ट्रिशियन",
      jobDescription: "घराची वायरिंग",
      jobWorkerCount: 2,
      jobCity: "कोल्हापूर",
      jobPayAmount: 800,
      jobPayType: "daily",
      jobStartDate: "2026-12-01",
      jobShiftType: "day",
      jobSkills: {
        raw: ["wiring"],
        skillIds: ["65f000000000000000000001"],
        resolved: [{ rawText: "wiring", id: "65f000000000000000000001", canonicalName: "Electrician" }],
        unresolved: [],
      },
    },
    "mr"
  );

  assert.strictEqual(values.title, "इलेक्ट्रिशियन");
  assert.strictEqual(values.description, "घराची वायरिंग");
  assert.strictEqual(values.requiredWorkers, 2);
  assert.strictEqual(values.city, "कोल्हापूर");
  assert.strictEqual(values.payAmount, 800);
  assert.strictEqual(values.payType, "daily");
  assert.strictEqual(values.startDate, "2026-12-01");
  assert.strictEqual(values.shiftType, "day");
  assert.deepEqual(values.skillIds, ["65f000000000000000000001"]);
  assert.strictEqual(values.originalLanguage, "mr");
});

// --- nothing is invented ----------------------------------------------------

test("an empty draft yields only the spoken language", () => {
  const values = toFormValues({}, "hi");
  assert.deepEqual(values, { originalLanguage: "hi" });
});

test("a skipped step contributes no key at all", () => {
  const values = toFormValues({ jobTitle: "Electrician" }, "en");
  // Absent, not null: the form's own defaults apply and the employer sees a
  // blank rather than a value they never gave.
  assert.ok(!("city" in values));
  assert.ok(!("payAmount" in values));
  assert.ok(!("payType" in values));
  assert.ok(!("requiredWorkers" in values));
  assert.ok(!("startDate" in values));
  assert.ok(!("skillIds" in values));
});

test("a null pay amount is not carried over as a number", () => {
  const values = toFormValues({ jobTitle: "Electrician", jobPayAmount: null }, "en");
  assert.ok(!("payAmount" in values));
});

test("a pay amount of zero is kept, because zero is a number the employer said", () => {
  const values = toFormValues({ jobPayAmount: 0 }, "en");
  assert.strictEqual(values.payAmount, 0);
});

test("unresolved skill phrases are never guessed into ids", () => {
  const values = toFormValues(
    {
      jobSkills: {
        raw: ["something unusual"],
        skillIds: [],
        resolved: [],
        unresolved: ["something unusual"],
      },
    },
    "en"
  );
  assert.ok(!("skillIds" in values), "an unmatched phrase became a skill id");
});

test("only the resolved subset is preselected when some phrases fail", () => {
  const values = toFormValues(
    {
      jobSkills: {
        raw: ["wiring", "mystery trade"],
        skillIds: ["65f000000000000000000001"],
        resolved: [{ rawText: "wiring", id: "65f000000000000000000001", canonicalName: "Electrician" }],
        unresolved: ["mystery trade"],
      },
    },
    "en"
  );
  assert.deepEqual(values.skillIds, ["65f000000000000000000001"]);
});

// --- the mapping cannot publish --------------------------------------------

test("the mapping never sets a status, so it cannot make a job live", () => {
  const values = toFormValues(
    { jobTitle: "Electrician", jobPayAmount: 800, jobPayType: "daily" },
    "en"
  );
  assert.ok(!("status" in values), "the voice mapping set a job status");
  assert.ok(!("employerId" in values), "the voice mapping set an employer id");
  assert.ok(!("_id" in values));
});

// --- the client exposes no publish path ------------------------------------

test("the voice-job API client has no call that creates a job", () => {
  const exported = Object.keys(voiceJobApi).sort();
  assert.deepEqual(exported, [
    "consumeGuidedDraft",
    "discardGuidedDraft",
    "getGuidedDraft",
    "setGuidedField",
    "startGuided",
    "submitGuidedStep",
  ]);
  for (const name of exported) {
    assert.ok(
      !/publish|create|post job/i.test(name),
      `${name} looks like a publish path; jobs must go through jobs.create()`
    );
  }
});

// --- the Add Job page still offers both paths -------------------------------

test("the post-job page offers a manual and a voice path, and starts neither", async () => {
  // Rendered through the real module graph: if the voice wizard auto-started,
  // an employer who wanted to type would be dropped into a recorder.
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const rrd = await import("react-router-dom");
  const MemoryRouter = (rrd.default ?? rrd).MemoryRouter;

  globalThis.localStorage ??= {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); },
  };

  const { LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx");
  const { AuthProvider } = await vite.ssrLoadModule("/src/context/AuthContext.jsx");
  const { PostJobPage } = await vite.ssrLoadModule("/src/pages/PostJobPage.jsx");
  const en = (await vite.ssrLoadModule("/src/context/translations/en.js")).default;

  const markup = renderToStaticMarkup(
    React.createElement(MemoryRouter, null,
      React.createElement(LanguageProvider, null,
        React.createElement(AuthProvider, null, React.createElement(PostJobPage))))
  );

  assert.ok(markup.includes(en["voiceJob.modeManual"]), "the manual option is missing");
  assert.ok(markup.includes(en["voiceJob.modeVoice"]), "the voice option is missing");
  // No recorder, and no job form, until the employer picks one.
  assert.ok(!markup.includes(en["voice.tapToRecord"]), "the recorder started on its own");
  assert.ok(!markup.includes(en["jobs.form.titleRequired"]), "the form rendered before a choice");
});
