import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Two classes of UI defect that are invisible to every other test here:
 * a control whose label has no translation, and a control whose label is
 * painted the same colour as its own background.
 *
 * The second one shipped: index.css styles EVERY <button> as a primary
 * action (blue ground, white text). A rule that repaints a button's ground
 * light but does not restate `color` inherits that white text, so the label
 * disappears. The guided wizard's shift chips rendered as three blank pills
 * in Marathi exactly this way - the strings were present and correct the
 * whole time.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

const DICTS = {
  en: (await import(path.join(SRC, "context/translations/en.js"))).default,
  mr: (await import(path.join(SRC, "context/translations/mr.js"))).default,
  hi: (await import(path.join(SRC, "context/translations/hi.js"))).default,
};

const enums = await import(path.join(SRC, "utils/enums.js"));
const labels = await import(path.join(SRC, "utils/enumLabels.js"));

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.jsx?$/.test(full) ? [full] : [];
  });
}

function cssFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return full.endsWith(".css") ? [full] : [];
  });
}

// --- every selectable option has a real label in every language -----------

test("every shift option has a non-empty label in en, mr and hi", () => {
  assert.ok(enums.SHIFT_TYPES.length > 0);
  for (const shift of enums.SHIFT_TYPES) {
    const key = labels.SHIFT_TYPE_KEYS[shift];
    assert.ok(key, `no label key for shift "${shift}"`);
    for (const lang of ["en", "mr", "hi"]) {
      const value = DICTS[lang][key];
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `${lang}.js has no usable label for shift "${shift}" (key ${key})`
      );
    }
  }
});

test("every pay type, availability and proficiency option is labelled in all three languages", () => {
  const groups = [
    [enums.PAY_TYPES, labels.PAY_TYPE_KEYS, "pay type"],
    [enums.AVAILABILITY_OPTIONS, labels.AVAILABILITY_KEYS, "availability"],
    [enums.WORKER_SKILL_PROFICIENCY, labels.PROFICIENCY_KEYS, "proficiency"],
  ];
  for (const [values, map, what] of groups) {
    for (const value of values) {
      const key = map[value];
      assert.ok(key, `no label key for ${what} "${value}"`);
      for (const lang of ["en", "mr", "hi"]) {
        const label = DICTS[lang][key];
        assert.ok(
          typeof label === "string" && label.trim().length > 0,
          `${lang}.js has no usable label for ${what} "${value}"`
        );
      }
    }
  }
});

// --- no control can inherit the global white button text ------------------

test("no class applied to a <button> repaints its ground light without restating colour", () => {
  // The selector-name heuristic this started as missed .post-job-mode, which
  // is a button but reads like a container. The classes are therefore taken
  // from the JSX: whatever is actually rendered on a <button> element.
  //
  // Children matter too - a lucide icon strokes with `currentColor`, so a
  // button that leaves `color` at the inherited #fff loses its icon even
  // when every text child is coloured individually.
  const LIGHT =
    /background(?:-color)?\s*:\s*(var\(--color-(?:surface|bg|surface-alt|primary-50|primary-100|warning-bg|success-bg|danger-bg)[^)]*\)|#f[0-9a-f]{2,5}\b|#fff(?:fff)?\b|white|transparent)/i;
  const HAS_COLOR = /(^|[;{\s])color\s*:/i;

  const buttonClasses = new Set();
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const [tag] of src.matchAll(/<button\b[^>]*>/g)) {
      for (const [, value] of tag.matchAll(/className=\{?[`"']([^`"']*)[`"']/g)) {
        for (const cls of value.split(/\s+/)) {
          if (/^[a-z][a-z0-9-]*$/.test(cls)) buttonClasses.add(cls);
        }
      }
    }
  }
  assert.ok(buttonClasses.size > 10, "found no button classes, so this is not testing anything");

  // Grouped by class, because `color` cascades across a class's rules: a
  // :hover that only repaints the ground is fine when the base rule states
  // the colour. A class is an offender only when SOME rule lightens its
  // ground and NO rule of that class ever declares a colour.
  const lightens = new Map();
  const declaresColour = new Set();
  for (const file of cssFiles(SRC)) {
    const css = readFileSync(file, "utf8");
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim();
      const body = match[2];
      if (/::/.test(selector)) continue;
      for (const part of selector.split(",")) {
        const last = (part.trim().split(/[\s>+~]+/).pop() || "").replace(/:[a-z-]+(\([^)]*\))?/g, "");
        const named = last.startsWith(".") ? last.slice(1).split(".")[0] : last;
        if (named !== "button" && !buttonClasses.has(named)) continue;
        if (HAS_COLOR.test(body)) declaresColour.add(named);
        if (LIGHT.test(body) && !lightens.has(named)) {
          lightens.set(named, `${path.relative(SRC, file)}: ${part.trim().replace(/\s+/g, " ")}`);
        }
      }
    }
  }
  const offenders = [...lightens]
    .filter(([cls]) => !declaresColour.has(cls))
    .map(([, where]) => where)
    .sort();
  assert.deepEqual(
    offenders,
    [],
    `these buttons inherit the global white label colour:\n  ${offenders.join("\n  ")}`
  );
});

// --- the classes the guided wizards reference must exist ------------------

test("every guided-wizard class used in JSX is defined in a stylesheet", () => {
  const allCss = cssFiles(SRC).map((f) => readFileSync(f, "utf8")).join("\n");
  const jsx = [
    "components/voice/GuidedVoiceWizard.jsx",
    "components/jobs/GuidedVoiceJobWizard.jsx",
  ].map((f) => readFileSync(path.join(SRC, f), "utf8")).join("\n");

  const used = new Set();
  for (const [, value] of jsx.matchAll(/className=\{?[`"]([^`"]*)[`"]/g)) {
    for (const cls of value.split(/\s+/)) {
      if (/^guided-[a-z-]+$/.test(cls)) used.add(cls);
    }
  }
  assert.ok(used.size > 5, "the scan found no guided- classes, so it is not testing anything");

  const undefinedClasses = [...used].filter((cls) => !allCss.includes(`.${cls}`));
  assert.deepEqual(
    undefinedClasses,
    [],
    `used in JSX but defined in no stylesheet: ${undefinedClasses.join(", ")}`
  );
});

// --- navigation stays reachable and nameable ------------------------------

test("a label hidden at narrow widths is hidden visually, not removed", () => {
  // The icon beside each nav label is aria-hidden, so `display: none` on the
  // label left the link with no accessible name at all - a screen reader
  // announced "link" and nothing else.
  const navbar = readFileSync(path.join(SRC, "components/layout/Navbar.css"), "utf8");
  for (const match of navbar.matchAll(/\.(navbar-link|nav-auth-actions)\s+span\s*\{([^}]*)\}/g)) {
    assert.ok(
      !/display\s*:\s*none/.test(match[2]),
      `${match[1]} span is removed outright, taking the link's accessible name with it`
    );
  }
});

test("a scrollable nav row does not centre its items unsafely", () => {
  // `justify-content: center` on an overflowing flex row spills in both
  // directions; the items before the centre cannot be scrolled back to.
  const navbar = readFileSync(path.join(SRC, "components/layout/Navbar.css"), "utf8");
  for (const match of navbar.matchAll(/\.navbar-links\s*\{([^}]*)\}/g)) {
    const body = match[1];
    if (!/overflow-x\s*:\s*auto|overflow\s*:\s*auto/.test(body)) continue;
    const justify = body.match(/justify-content\s*:\s*([^;]+)/);
    if (!justify) continue;
    assert.ok(
      !/^\s*center\s*$/.test(justify[1]),
      "an overflowing nav row centres unsafely, so its leading items are unreachable"
    );
  }
});
