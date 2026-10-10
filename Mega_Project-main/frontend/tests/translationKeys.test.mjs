import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every t("key") call site must resolve to a real key, in all three languages.
 *
 * WHY THIS CLASS OF BUG IS INVISIBLE WITHOUT A TEST: LanguageContext resolves a
 * missing key to THE KEY ITSELF -
 *
 *     let text = dict[key] ?? DICTIONARIES.en[key] ?? key;
 *
 * - so a typo or an undefined key never throws and never renders empty. It
 * renders the key string to the user, in every language, and because that
 * string is truthy an `|| "English fallback"` written next to it is dead code
 * that can never run. 140 user-visible strings shipped this way: the home page
 * showed "categories.electrician.title", the login form labelled its field
 * "password", and Marathi and Hindi showed exactly the same raw keys as English.
 *
 * These tests fail on the next undefined key instead of letting it ship.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const TRANSLATIONS = path.join(SRC, "context/translations");

const DICTS = {
  en: (await import(path.join(TRANSLATIONS, "en.js"))).default,
  mr: (await import(path.join(TRANSLATIONS, "mr.js"))).default,
  hi: (await import(path.join(TRANSLATIONS, "hi.js"))).default,
};

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.jsx?$/.test(full) ? [full] : [];
  });
}

// `\b` matters: without it this also matches `params.set("query", ...)`.
const CALL_SITE = /\bt\("([^"]+)"/g;

function callSites() {
  const found = new Map();
  for (const file of sourceFiles(SRC)) {
    const rel = path.relative(SRC, file);
    for (const [, key] of readFileSync(file, "utf8").matchAll(CALL_SITE)) {
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(rel);
    }
  }
  return found;
}

test("every t() key used in the source exists in en.js", () => {
  const undefinedKeys = [...callSites()]
    .filter(([key]) => !(key in DICTS.en))
    .map(([key, files]) => `${key} (${[...files].join(", ")})`);
  assert.deepEqual(undefinedKeys, [], `these keys would render as raw text:\n  ${undefinedKeys.join("\n  ")}`);
});

test("mr and hi define exactly the same keys as en", () => {
  const en = Object.keys(DICTS.en);
  for (const lang of ["mr", "hi"]) {
    const other = new Set(Object.keys(DICTS[lang]));
    assert.deepEqual(en.filter((k) => !other.has(k)), [], `${lang}.js is missing keys`);
    assert.deepEqual([...other].filter((k) => !(k in DICTS.en)), [], `${lang}.js has keys en.js does not`);
  }
});

test("no mr/hi value is left as its untranslated English text", () => {
  const devanagari = /[ऀ-ॿ]/;
  for (const lang of ["mr", "hi"]) {
    const untranslated = Object.entries(DICTS[lang])
      .filter(([key, value]) =>
        typeof value === "string" &&
        value === DICTS.en[key] &&
        /[A-Za-z]{3}/.test(value) &&
        !devanagari.test(value))
      .map(([key]) => key);
    assert.deepEqual(untranslated, [], `${lang}.js still holds English for these keys`);
  }
});

test("no t() call site keeps a dead `|| fallback`", () => {
  // t() cannot return a falsy value, so anything after `||` is unreachable and
  // only hides the missing key it was written to cover.
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    for (const [match] of readFileSync(file, "utf8").matchAll(/\bt\("[^"]+"\)\s*\|\|/g)) {
      offenders.push(`${path.relative(SRC, file)}: ${match}`);
    }
  }
  assert.deepEqual(offenders, [], `unreachable fallbacks:\n  ${offenders.join("\n  ")}`);
});

test("every enum label key maps to a real translation", async () => {
  // These are looked up dynamically - t(PAY_TYPE_KEYS[job.payType]) - so the
  // static call-site scan above cannot see them. An unmapped enum value would
  // print the raw backend value ("partially_assigned") to the user.
  const labels = await import(path.join(SRC, "utils/enumLabels.js"));
  const enums = await import(path.join(SRC, "utils/enums.js"));
  const groups = {
    PAY_TYPE_KEYS: enums.PAY_TYPES,
    SHIFT_TYPE_KEYS: enums.SHIFT_TYPES,
    AVAILABILITY_KEYS: enums.AVAILABILITY_OPTIONS,
    PROFICIENCY_KEYS: enums.WORKER_SKILL_PROFICIENCY,
  };
  for (const [mapName, values] of Object.entries(groups)) {
    for (const value of values) {
      const key = labels[mapName][value];
      assert.ok(key, `${mapName} has no entry for the backend enum value "${value}"`);
      assert.ok(key in DICTS.en, `${mapName}.${value} points at undefined key "${key}"`);
    }
  }
  // StatusPill covers both job and application statuses plus availability.
  for (const status of [...enums.JOB_STATUS, ...enums.APPLICATION_STATUS, ...enums.AVAILABILITY_OPTIONS]) {
    const key = labels.STATUS_KEYS[status];
    assert.ok(key, `STATUS_KEYS has no entry for "${status}" - the badge would print the raw value`);
    assert.ok(key in DICTS.en, `STATUS_KEYS.${status} points at undefined key "${key}"`);
  }
});

test("every error key the error mapper can return is defined", async () => {
  const { mapErrorToMessageKey } = await import(path.join(SRC, "utils/errorMessages.js"));
  const statuses = [400, 401, 403, 404, 409, 413, 429, 503, 500, null];
  for (const context of ["default", "voice"]) {
    for (const status of statuses) {
      for (const isTimeout of [false, true]) {
        const key = mapErrorToMessageKey({ status, isNetworkError: status === null, isTimeout }, context);
        assert.ok(key in DICTS.en, `error key "${key}" (status ${status}, ${context}) is undefined`);
      }
    }
  }
});

test("interpolated keys declare every placeholder their call site passes", () => {
  // t(key, vars) substitutes {{name}}. A key whose text lacks the placeholder
  // silently drops the value.
  const expected = { "dashboard.greeting": "name", noJobsMatchFilter: "filter" };
  for (const [key, placeholder] of Object.entries(expected)) {
    for (const lang of ["en", "mr", "hi"]) {
      assert.match(
        DICTS[lang][key],
        new RegExp(`\\{\\{${placeholder}\\}\\}`),
        `${lang}.js "${key}" must contain {{${placeholder}}}`
      );
    }
  }
});
