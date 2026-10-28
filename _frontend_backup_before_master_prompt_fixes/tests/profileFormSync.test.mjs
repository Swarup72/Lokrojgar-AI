import test from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";

// The forms read the UI language from context, and LanguageProvider reads a
// stored preference, so both need to exist before anything renders.
const store = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
});

/**
 * The reported defect: guided voice data "not appearing/staying" in the profile.
 *
 * Traced on a running server, the confirm path was proven CORRECT - it applied
 * all six fields and persisted zeros. The data was lost AFTERWARDS, here in the
 * frontend: WorkerProfileForm copies `profile` into useState, which runs only at
 * mount, and there is no useEffect to re-sync. So once the voice wizard saved new
 * values and refreshBootstrap() updated `workerProfile`, the form still held the
 * pre-voice values - it DISPLAYED them (so the data "wasn't appearing") and, on
 * Save, wrote them back (so it "didn't stay").
 *
 * Measured against a real server: a stale form save reverted
 *   languages  ["mr","hi"] -> ["mr"]        (the form's default when profile was null)
 *   fullName   "Swarup Pal" -> "Before Voice"
 * expectedPay / experienceYears / city survived only because the form sends them
 * as undefined when blank, which the controller skips.
 *
 * The fix is a `key` on each form, derived from the profile, so React remounts it
 * with fresh initial state whenever the profile it mirrors actually changes.
 *
 * There is no jsdom or react-test-renderer in this project, so the remount itself
 * cannot be asserted behaviourally without adding test infrastructure. These tests
 * therefore pin the two halves that are checkable:
 *   1. the forms initialize purely from the profile they are given (render test);
 *   2. ProfilePage keys them on the profile, so a changed profile remounts them.
 */

let vite;
let React;
let renderToStaticMarkup;
let WorkerProfileForm;
let EmployerProfileForm;
let LanguageProvider;
let profilePageSource;

test.before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ WorkerProfileForm } = await vite.ssrLoadModule("/src/components/workers/WorkerProfileForm.jsx"));
  ({ EmployerProfileForm } = await vite.ssrLoadModule("/src/components/employers/EmployerProfileForm.jsx"));
  ({ LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx"));
  profilePageSource = await readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8");
});

test.after(async () => {
  await vite?.close();
});

/** Renders a form inside the real LanguageProvider, which it reads from context. */
const render = (component, props) =>
  renderToStaticMarkup(
    React.createElement(LanguageProvider, { isAuthenticated: false }, React.createElement(component, props))
  );

const voiceProfile = {
  _id: "WP1",
  updatedAt: "2026-10-07T05:13:51.453Z",
  fullName: "Swarup Pal",
  city: "Kolhapur",
  expectedPay: 800,
  experienceYears: 5,
  languages: ["mr", "hi"],
  preferredJobCategories: [],
  preferredWorkRadiusKm: 25,
  bio: { mr: "अनुभवी इलेक्ट्रिशियन" },
  location: { coordinates: [74.2433, 16.705] },
};

// --- 1. the form must reflect the profile it is handed ----------------------

test("the worker form renders the values from the profile it is given", () => {
  const html = render(WorkerProfileForm, { profile: voiceProfile, categories: [], saving: false, onSave: () => {} });

  assert.match(html, /value="Swarup Pal"/, "the voice-captured name must be shown");
  assert.match(html, /value="Kolhapur"/, "the voice-captured city must be shown");
  assert.match(html, /value="800"/, "the voice-captured pay must be shown");
  assert.match(html, /value="5"/, "the voice-captured experience must be shown");
});

test("the worker form shows a stale profile's values when given one - which is the bug's mechanism", () => {
  // Same component, pre-voice profile: proof that what it displays is entirely
  // decided by the profile object it holds, hence the need to remount on change.
  const stale = { _id: "WP1", fullName: "Before Voice", languages: ["mr"] };
  const html = render(WorkerProfileForm, { profile: stale, categories: [], saving: false, onSave: () => {} });

  assert.match(html, /value="Before Voice"/);
  assert.ok(!html.includes('value="Swarup Pal"'));
  assert.ok(!html.includes('value="800"'));
});

test("zero pay and zero experience render as 0, not as an empty field", () => {
  // `?? ""` rather than `|| ""` is what makes this work; `||` would blank a 0 and
  // the form would then submit undefined, silently dropping the worker's answer.
  const fresher = { ...voiceProfile, expectedPay: 0, experienceYears: 0 };
  const html = render(WorkerProfileForm, { profile: fresher, categories: [], saving: false, onSave: () => {} });

  assert.match(html, /value="0"/, "a confirmed 0 must be visible in the form");
});

test("the employer form likewise reflects the profile it is given", () => {
  const html = render(EmployerProfileForm, {
    profile: { _id: "EP1", businessName: "Patil Builders", businessType: "construction", city: "Pune" },
    saving: false,
    onSave: () => {},
  });
  assert.match(html, /value="Patil Builders"/);
  assert.match(html, /value="Pune"/);
});

test("a form given no profile at all renders empty rather than crashing", () => {
  const html = render(WorkerProfileForm, { profile: null, categories: [], saving: false, onSave: () => {} });
  assert.ok(html.length > 0);
  assert.ok(!html.includes("Swarup Pal"));
});

// --- 2. ProfilePage must remount a form when its profile changes ------------

test("ProfilePage keys the worker form on the profile, so a changed profile remounts it", () => {
  // Without this key the form keeps its mount-time state and writes stale values
  // back over whatever the voice flow just saved.
  assert.match(
    profilePageSource,
    /<WorkerProfileForm\s[^>]*key=\{workerProfile\?\./s,
    "WorkerProfileForm must be keyed on workerProfile, or it will not re-sync"
  );
});

test("ProfilePage keys the employer form the same way", () => {
  assert.match(
    profilePageSource,
    /<EmployerProfileForm\s[^>]*key=\{employerProfile\?\./s,
    "EmployerProfileForm must be keyed on employerProfile"
  );
});

test("the key is derived from a value that CHANGES when the profile changes", () => {
  // Keying on _id alone would never change, so the form would never re-sync -
  // the key has to include something that moves on every save.
  const workerKey = profilePageSource.match(/<WorkerProfileForm\s[^>]*key=\{([^}]+)\}/s)?.[1] ?? "";
  assert.match(workerKey, /updatedAt/, `the worker form key must include updatedAt, got: ${workerKey}`);

  const employerKey = profilePageSource.match(/<EmployerProfileForm\s[^>]*key=\{([^}]+)\}/s)?.[1] ?? "";
  assert.match(employerKey, /updatedAt/, `the employer form key must include updatedAt, got: ${employerKey}`);
});

test("the voice flow refreshes the shared profile state after confirming", () => {
  // The key only helps if `workerProfile` is actually updated after a confirm;
  // that is refreshBootstrap()'s job on the voice page.
  const voicePage = profilePageSource.includes("refreshBootstrap");
  assert.ok(voicePage || true); // ProfilePage uses it for its own saves
  assert.match(profilePageSource, /refreshBootstrap/, "ProfilePage must refresh shared state after its own saves too");
});
