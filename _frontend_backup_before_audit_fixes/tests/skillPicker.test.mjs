import test from "node:test";
import assert from "node:assert";

/**
 * The Add Job skill picker.
 *
 * The property that matters most: a SUGGESTION IS NOT A SELECTION. The old
 * UI listed every skill in the category as a chip; the new one suggests a
 * few from the title and description. If those were pre-selected, an advert
 * would carry requirements the employer never chose - so the component must
 * render suggestions without ever calling onChange by itself.
 */

let vite;
let React;
let renderToStaticMarkup;
let SkillPicker;
let LanguageProvider;
let en;

test.before(async () => {
  globalThis.localStorage ??= {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); },
  };
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "silent" });
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ SkillPicker } = await vite.ssrLoadModule("/src/components/jobs/SkillPicker.jsx"));
  ({ LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx"));
  en = (await vite.ssrLoadModule("/src/context/translations/en.js")).default;
});

test.after(async () => {
  await vite?.close();
});

const render = (props) =>
  renderToStaticMarkup(
    React.createElement(LanguageProvider, null, React.createElement(SkillPicker, props))
  );

test("with nothing chosen it says so instead of listing the whole catalogue", () => {
  const html = render({ categoryId: "CAT1", title: "", description: "", value: [], onChange() {} });
  assert.ok(html.includes(en["skills.pickerNoneSelected"]));
  // The defect being replaced: dozens of chips rendered before any input.
  assert.ok(!html.includes("form-chip"), "the old chip grid is still being rendered");
});

test("it never selects anything on its own", () => {
  // Rendering must not mutate the employer's selection.
  let called = 0;
  render({
    categoryId: "CAT1",
    title: "Electrician required",
    description: "House wiring and switchboard installation",
    value: [],
    onChange: () => { called += 1; },
  });
  assert.strictEqual(called, 0, "the picker changed the selection without the employer acting");
});

test("a chosen skill is shown with its own remove control", () => {
  const html = render({ categoryId: "CAT1", value: ["S1"], onChange() {} });
  assert.ok(html.includes("skill-picker-tag"), "the selection is not displayed");
  assert.ok(html.includes("aria-label"), "the remove control has no accessible name");
  assert.ok(html.includes(en["skills.clearAll"]), "there is no clear-all control");
});

test("search is offered, and explains itself before a category is chosen", () => {
  const withCategory = render({ categoryId: "CAT1", value: [], onChange() {} });
  assert.ok(withCategory.includes("skill-picker-search"), "no search field");

  const without = render({ categoryId: "", value: [], onChange() {} });
  assert.ok(
    without.includes(en["skills.chooseCategoryFirst"]),
    "no explanation of why search is unavailable"
  );
});

test("the search input is a real labelled control", () => {
  const html = render({ categoryId: "CAT1", value: [], onChange() {} });
  assert.ok(html.includes(en["skills.searchLabel"]), "the search field has no accessible name");
  assert.ok(html.includes(`placeholder="${en["skills.searchPlaceholder"]}"`));
});

test("the catalog client exposes no way to create a skill from this screen", async () => {
  const catalog = await vite.ssrLoadModule("/src/api/catalog.js");
  const names = Object.keys(catalog).sort();
  assert.deepStrictEqual(names, ["getCategories", "getSkills", "suggestSkills"]);
});

test("every string the picker shows exists in all three languages", async () => {
  const mr = (await vite.ssrLoadModule("/src/context/translations/mr.js")).default;
  const hi = (await vite.ssrLoadModule("/src/context/translations/hi.js")).default;
  const keys = [
    "skills.pickerNoneSelected", "skills.clearAll", "skills.suggestedLabel",
    "skills.suggesting", "skills.suggestFailed", "skills.searchLabel",
    "skills.searchPlaceholder", "skills.chooseCategoryFirst", "skills.noMatches",
  ];
  for (const key of keys) {
    for (const [name, dict] of [["en", en], ["mr", mr], ["hi", hi]]) {
      assert.ok(
        typeof dict[key] === "string" && dict[key].trim(),
        `${name}.js is missing a usable value for ${key}`
      );
    }
  }
});
