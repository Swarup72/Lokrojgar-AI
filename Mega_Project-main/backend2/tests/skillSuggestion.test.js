/**
 * Skill suggestions for the Add Job form.
 *
 * Replaces a grid of every skill in a category with a short, relevant list
 * derived from what the employer actually typed. The properties that matter:
 * a suggestion is always a REAL catalog document (so no invented or
 * duplicate skill can enter a job), nothing is suggested from empty input,
 * and an unrecognisable description yields an honest empty list rather than
 * an arbitrary pick.
 */

import test from "node:test";
import assert from "node:assert";
import { suggestSkillsFromText } from "../src/utils/skillNormalization.js";

const skill = (id, en, hi, mr, categoryId = "CAT1") => ({
  _id: id,
  name: { en, hi, mr },
  categoryId,
});

const CATALOG = [
  skill("S1", "Plumbing", "नलसाज़ी", "नळकाम"),
  skill("S2", "Pipe Fitting", "पाइप फिटिंग", "पाइप फिटिंग"),
  skill("S3", "Painting", "पेंटिंग", "रंगकाम"),
  skill("S4", "Masonry", "चिनाई", "गवंडीकाम"),
];

test("an English description suggests the skills it names", () => {
  const out = suggestSkillsFromText("Plumber required. Fix leaking taps and pipe fitting work.", CATALOG);
  const names = out.map((s) => s.canonicalName);
  assert.ok(names.includes("Pipe Fitting"), `expected Pipe Fitting, got ${names.join(", ")}`);
  // "Plumber" reaches Plumbing through the existing alias table.
  assert.ok(names.includes("Plumbing"), `expected Plumbing via alias, got ${names.join(", ")}`);
});

test("a Marathi description suggests the same catalog entries", () => {
  const out = suggestSkillsFromText("घराचे नळकाम आणि रंगकाम करायचे आहे", CATALOG);
  const names = out.map((s) => s.canonicalName).sort();
  assert.deepStrictEqual(names, ["Painting", "Plumbing"]);
});

test("a Hindi description suggests the same catalog entries", () => {
  const out = suggestSkillsFromText("नलसाज़ी और पाइप फिटिंग का काम है", CATALOG);
  const names = out.map((s) => s.canonicalName).sort();
  assert.deepStrictEqual(names, ["Pipe Fitting", "Plumbing"]);
});

test("every suggestion carries a real catalog id - none are invented", () => {
  const ids = new Set(CATALOG.map((s) => s._id));
  for (const s of suggestSkillsFromText("plumbing painting masonry pipe fitting", CATALOG)) {
    assert.ok(ids.has(s.id), `suggested an id that is not in the catalog: ${s.id}`);
  }
});

test("a description that names nothing in the catalog suggests nothing", () => {
  // The honest empty state. Picking "closest" here would put a skill the
  // employer never asked for onto a published advert.
  const out = suggestSkillsFromText("I need someone reliable for general help", CATALOG);
  assert.deepStrictEqual(out, []);
});

test("empty or missing input suggests nothing", () => {
  assert.deepStrictEqual(suggestSkillsFromText("", CATALOG), []);
  assert.deepStrictEqual(suggestSkillsFromText("   ", CATALOG), []);
  assert.deepStrictEqual(suggestSkillsFromText(null, CATALOG), []);
  assert.deepStrictEqual(suggestSkillsFromText("plumbing", null), []);
});

test("the same skill named twice is suggested once", () => {
  const out = suggestSkillsFromText("plumbing, plumbing and more plumbing", CATALOG);
  assert.strictEqual(out.filter((s) => s.canonicalName === "Plumbing").length, 1);
});

test("a very short catalog name cannot match inside an unrelated word", () => {
  const withShort = [...CATALOG, skill("S5", "AC", "एसी", "एसी")];
  // "AC" is two characters; it appears inside "replace", "machine", ...
  const out = suggestSkillsFromText("Replace the machine in the back room", withShort);
  assert.ok(!out.some((s) => s.canonicalName === "AC"), "a 2-letter name matched inside another word");
});

test("the suggestion list stays short enough to be reviewable", () => {
  const many = Array.from({ length: 30 }, (_, i) => skill(`X${i}`, `Skill Number ${i}`, `स${i}`, `स${i}`));
  const text = many.map((s) => s.name.en).join(" ");
  assert.ok(suggestSkillsFromText(text, many).length <= 8);
});

test("a longer, more specific name wins over the word it contains", () => {
  const out = suggestSkillsFromText("I need pipe fitting done", CATALOG);
  assert.strictEqual(out[0].canonicalName, "Pipe Fitting");
});


// --- the Electrician trade, in every language the app supports -------------
//
// The catalog seeds Electrician with one Devanagari spelling for both mr and
// hi ("इलेक्ट्रिशियन"). Hindi is commonly written "इलेक्ट्रीशियन" and spoken
// as "बिजली मिस्त्री", so a Hindi employer describing exactly this job
// matched nothing until those variants were aliased.

const ELECTRICAL_CATALOG = [
  skill("E1", "Electrician", "इलेक्ट्रिशियन", "इलेक्ट्रिशियन"),
  skill("E2", "Wire Connection", "वायर कनेक्शन", "वायर जोडणी"),
  skill("E3", "Switch Installation", "स्विच इंस्टॉलेशन", "स्विच बसवणे"),
  skill("E4", "Electrical Maintenance", "विद्युत रखरखाव", "विद्युत देखभाल"),
];

test("an electrician job suggests the Electrician trade in English", () => {
  for (const text of [
    "Electrician required for house wiring",
    "I need two electricians for wiring work in Kolhapur",
  ]) {
    const names = suggestSkillsFromText(text, ELECTRICAL_CATALOG).map((s) => s.canonicalName);
    assert.ok(names.includes("Electrician"), `${text} -> ${names.join(", ") || "(none)"}`);
  }
});

test("an electrician job suggests the Electrician trade in Marathi", () => {
  const names = suggestSkillsFromText("मला दोन इलेक्ट्रिशियन पाहिजेत", ELECTRICAL_CATALOG)
    .map((s) => s.canonicalName);
  assert.ok(names.includes("Electrician"), names.join(", ") || "(none)");
});

test("an electrician job suggests the Electrician trade in Hindi, including spelling variants", () => {
  for (const text of ["मुझे इलेक्ट्रीशियन चाहिए", "बिजली मिस्त्री चाहिए", "मुझे इलेक्ट्रिशियन चाहिए"]) {
    const names = suggestSkillsFromText(text, ELECTRICAL_CATALOG).map((s) => s.canonicalName);
    assert.ok(names.includes("Electrician"), `${text} -> ${names.join(", ") || "(none)"}`);
  }
});

test("electrical sub-skills are suggested when the description names them", () => {
  const names = suggestSkillsFromText(
    "Switch installation and electrical maintenance for a new building",
    ELECTRICAL_CATALOG
  ).map((s) => s.canonicalName);
  assert.ok(names.includes("Switch Installation"), names.join(", "));
  assert.ok(names.includes("Electrical Maintenance"), names.join(", "));
});

test("an alias never resolves to a skill the catalog does not contain", () => {
  // The alias table names canonical skills; if one is absent from the catalog
  // being searched, nothing may be suggested for it.
  const onlyPlumbing = [skill("P1", "Plumbing", "नलसाज़ी", "नळकाम")];
  const names = suggestSkillsFromText("I need an electrician", onlyPlumbing).map((s) => s.canonicalName);
  assert.deepStrictEqual(names, [], `suggested ${names.join(", ")} from a catalog without Electrician`);
});
