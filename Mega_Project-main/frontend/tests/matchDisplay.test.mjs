import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMatchScore, getSkillMessageKey } from "../src/utils/matchDisplay.js";
import { deriveRecommendationScore } from "../src/utils/recommendationScoring.js";
import en from "../src/context/translations/en.js";
import hi from "../src/context/translations/hi.js";
import mr from "../src/context/translations/mr.js";

const LOCALES = { en, hi, mr };
const esc = (str) => str.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
const NEW_KEYS = [
  "recommendations.noMatchingSkills",
  "recommendations.addSkillsPrompt",
  "match.scoreUnavailable",
  "match.scoreAria",
  "match.scoreHelper",
  "applications.matchScoreBadge",
];

let vite, React, renderToStaticMarkup, MatchScoreBadge, JobCard, LanguageProvider, MemoryRouter;

test.before(async () => {
  globalThis.localStorage ??= {
    _store: new Map(),
    getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
    setItem(k, v) { this._store.set(k, String(v)); },
    removeItem(k) { this._store.delete(k); },
  };
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "silent" });
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ MatchScoreBadge } = await vite.ssrLoadModule("/src/components/recommendations/MatchScoreBadge.jsx"));
  ({ JobCard } = await vite.ssrLoadModule("/src/components/jobs/JobCard.jsx"));
  ({ LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx"));
});

test.after(async () => {
  await vite?.close();
});

const inLang = (lang, element) => {
  localStorage.setItem("lokrozgar.language", lang);
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(LanguageProvider, null, element))
  );
};

// --- score normalisation ------------------------------------------------------

test("normalizeMatchScore keeps valid 0-100 scores without re-scaling", () => {
  for (const v of [0, 42, 77, 100]) assert.equal(normalizeMatchScore(v), v);
  assert.equal(normalizeMatchScore(77.04), 77);
  assert.equal(normalizeMatchScore(76.5), 77);
});

test("normalizeMatchScore rejects null, undefined and invalid values", () => {
  for (const v of [null, undefined, NaN, Infinity, "77", {}, []]) assert.equal(normalizeMatchScore(v), null);
});

// --- badge --------------------------------------------------------------------

test("badge renders valid scores localized, never NaN/undefined, no double conversion", () => {
  const html = (lang, score, extra = {}) => inLang(lang, React.createElement(MatchScoreBadge, { score, ...extra }));
  assert.match(html("en", 77), />77% Match</);
  assert.match(html("hi", 77), />77% मिलान</);
  assert.match(html("mr", 77), />77% जुळणी</);
  assert.match(html("en", 0), />0% Match</);
  assert.match(html("en", 42), />42% Match</);
  assert.match(html("en", 100), />100% Match</);
  assert.doesNotMatch(html("en", 77), /7700|NaN|undefined/);
  assert.match(html("en", 77), /aria-label="Match with your profile: 77 percent"/);
});

test("badge shows localized unavailable indicator for invalid scores", () => {
  const html = (lang, score, extra = {}) => inLang(lang, React.createElement(MatchScoreBadge, { score, ...extra }));
  assert.match(html("en", NaN), /Match unavailable/);
  assert.match(html("hi", "abc"), /मिलान उपलब्ध नहीं/);
  assert.match(html("mr", undefined, { showUnavailable: true }), /जुळणी उपलब्ध नाही/);
  assert.equal(html("en", null), "", "no score and no recommendation context renders nothing");
  assert.doesNotMatch(html("en", NaN), /NaN%|undefined%/);
});

// --- skill message selection --------------------------------------------------

const job = { _id: "j1", title: { en: "Plumber" }, skillIds: [{ _id: "s1", name: "Plumbing" }] };
const factors = { skill: 0, location: 100, availability: 100, pay: null, rating: null, relevance: 100 };

test("getSkillMessageKey distinguishes the three situations", () => {
  assert.equal(getSkillMessageKey({ skillMatchStatus: "no-worker-skills", job }), "recommendations.addSkillsPrompt");
  assert.equal(getSkillMessageKey({ skillMatchStatus: "unmatched", job }), "recommendations.noMatchingSkills");
  assert.equal(getSkillMessageKey({ skillMatchStatus: "matched", matchingSkills: [job.skillIds[0]], job }), null);
  assert.equal(getSkillMessageKey({ skillMatchStatus: "unknown", job: { skillIds: [] } }), "recommendations.skillsNotSpecified");
});

test("status derived from real worker skill data selects the right message", () => {
  const match = { job, matchScore: 70, matchFactors: factors };
  assert.equal(deriveRecommendationScore({ match, workerSkills: [] }).skillMatchStatus, "no-worker-skills");
  assert.equal(
    deriveRecommendationScore({ match, workerSkills: [{ skillId: { _id: "other", name: "Welding" } }] }).skillMatchStatus,
    "unmatched"
  );
});

test("JobCard shows the right skill message in every language", () => {
  const card = (props) => React.createElement(JobCard, { job, matchFactors: factors, matchScore: 77, ...props });
  for (const lang of ["en", "hi", "mr"]) {
    const none = inLang(lang, card({ skillMatchStatus: "no-worker-skills" }));
    const nomatch = inLang(lang, card({ skillMatchStatus: "unmatched" }));
    assert.ok(none.includes(esc(LOCALES[lang]["recommendations.addSkillsPrompt"])), `${lang}: add-skills message`);
    assert.ok(!none.includes(esc(LOCALES[lang]["recommendations.noMatchingSkills"])), `${lang}: no-skills must not show no-match`);
    assert.ok(nomatch.includes(esc(LOCALES[lang]["recommendations.noMatchingSkills"])), `${lang}: no-match message`);
    assert.ok(!nomatch.includes(esc(LOCALES[lang]["recommendations.addSkillsPrompt"])));
    assert.ok(nomatch.includes(LOCALES[lang]["match.scoreHelper"]), `${lang}: helper text`);
  }
});

// --- negative values ----------------------------------------------------------

test("internal ranking penalty never reaches the rendered card", () => {
  const match = { job, matchScore: 77.0166, matchFactors: factors };
  const scored = deriveRecommendationScore({
    match,
    workerSkills: [{ skillId: { _id: "other", name: "Welding" } }],
  });
  // Source of the old red "-35.05"/"-34.78...": penaltyApplied = float original score
  // minus an integer-rounded penalised score, i.e. 35 +/- rounding residue.
  assert.ok(scored.penaltyApplied > 0 && !Number.isInteger(scored.penaltyApplied));
  const html = inLang(
    "en",
    React.createElement(JobCard, {
      job,
      matchFactors: factors,
      matchScore: scored.recommendationScore,
      originalMatchScore: scored.originalMatchScore,
      skillMatchStatus: scored.skillMatchStatus,
      penaltyApplied: scored.penaltyApplied,
    })
  );
  assert.doesNotMatch(html, /skills-penalty-tag/);
  assert.doesNotMatch(html, /-3\d(\.\d+)?</);
  // Badge reflects the backend overall score, not the rank-adjusted one.
  assert.match(html, />77% Match</);
});

test("penalty/ranking logic is unchanged", () => {
  const r = deriveRecommendationScore({
    match: { job, matchScore: 80, matchFactors: factors },
    workerSkills: [{ skillId: { _id: "other", name: "Welding" } }],
  });
  assert.equal(r.recommendationScore, 45);
  assert.equal(r.originalMatchScore, 80);
});

// --- locale coverage ----------------------------------------------------------

test("all new keys exist, are non-empty and are localized in every supported language", () => {
  for (const key of NEW_KEYS) {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      assert.ok(typeof dict[key] === "string" && dict[key].trim(), `${lang} missing ${key}`);
    }
    if (key !== "applications.matchScoreBadge") {
      assert.notEqual(hi[key], en[key], `hi must not reuse English for ${key}`);
      assert.notEqual(mr[key], en[key], `mr must not reuse English for ${key}`);
      assert.notEqual(mr[key], hi[key], `mr must not reuse Hindi for ${key}`);
    }
  }
  for (const lang of ["hi", "mr"]) {
    assert.match(LOCALES[lang]["recommendations.noMatchingSkills"], /[\u0900-\u097F]/);
  }
  assert.ok(!mr["recommendations.noMatchingSkills"].includes("आढळली नाहीत"), "blunt Marathi message replaced");
});
