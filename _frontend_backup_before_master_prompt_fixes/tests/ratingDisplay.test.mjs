import test from "node:test";
import assert from "node:assert";

/**
 * The ONE canonical rating display (Requirement 8).
 *
 * The reported symptom was a worker appearing with two different, contradictory
 * ratings. There is no duplicate rating FIELD - verified against the live dev
 * database, where all four ratings matched their profile aggregates exactly. The
 * two numbers were different CONCEPTS shown side by side on the same card:
 *
 *   1. the star rating, `ratingAvg (ratingCount)` - which rendered a worker who
 *      had never been rated as "0.0 (0)", reading as a zero-star review;
 *   2. the recommendation's `rating` MATCH FACTOR, a 0-100 compatibility score,
 *      labelled simply "Rating" directly beneath it.
 *
 * These tests pin both fixes: never-rated renders as words, and the match factor
 * is no longer called "Rating".
 */

let vite;
let renderToStaticMarkup;
let RatingStars;
let MatchFactorsList;
let LanguageProvider;
let React;

test.before(async () => {
  // utils/storage.js reads localStorage directly (browser-only); these
  // components are rendered here in Node, so stand one in. Empty storage means
  // the provider falls back to its "en" default, which is what these
  // assertions have always been written against.
  globalThis.localStorage ??= {
    _store: new Map(),
    getItem(key) { return this._store.has(key) ? this._store.get(key) : null; },
    setItem(key, value) { this._store.set(key, String(value)); },
    removeItem(key) { this._store.delete(key); },
  };
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  // react and react-dom are CommonJS, so they are imported normally; only the
  // project's own .jsx files need Vite's transform.
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ RatingStars } = await vite.ssrLoadModule("/src/components/common/RatingStars.jsx"));
  ({ MatchFactorsList } = await vite.ssrLoadModule(
    "/src/components/recommendations/MatchFactorsList.jsx"
  ));
  // These components read their labels from the language dictionaries, so they
  // must be rendered inside the provider the real app always wraps them in -
  // the English dictionary is the default, so the assertions below are unchanged.
  ({ LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx"));
});

test.after(async () => {
  await vite?.close();
});

const render = (component, props) =>
  renderToStaticMarkup(
    React.createElement(LanguageProvider, null, React.createElement(component, props))
  );

test("a never-rated worker shows words, never 0.0", () => {
  const html = render(RatingStars, { value: 0, count: 0 });

  assert.match(html, /Not rated yet/);
  assert.ok(!html.includes("0.0"), `"0.0" reads as a zero-star review: ${html}`);
});

test("a never-rated worker shows the same thing when the count is absent", () => {
  const html = render(RatingStars, { value: 0 });
  assert.match(html, /Not rated yet/);
  assert.ok(!html.includes("0.0"));
});

test("the compact form is shorter but still not a number", () => {
  const html = render(RatingStars, { value: 0, count: 0, compact: true });
  assert.match(html, /New/);
  assert.ok(!html.includes("0.0"));
});

test("a rated worker shows the canonical average and count", () => {
  const html = render(RatingStars, { value: 4.33, count: 3 });

  assert.match(html, /4\.3/);
  assert.match(html, /\(3\)/);
  assert.ok(!html.includes("Not rated yet"));
});

test("a single 5-star rating shows 5.0 (1), not 'New'", () => {
  const html = render(RatingStars, { value: 5, count: 1 });
  assert.match(html, /5\.0/);
  assert.match(html, /\(1\)/);
});

test("an individual rating with no count still renders as stars", () => {
  // RatingList passes one rating's own score with no count.
  const html = render(RatingStars, { value: 3 });
  assert.match(html, /3\.0/);
  assert.ok(!html.includes("Not rated yet"));
});

test("the match-factor list no longer calls its compatibility score 'Rating'", () => {
  const html = render(MatchFactorsList, {
    matchFactors: { skill: 80, location: 70, availability: 100, pay: null, rating: null, relevance: 50 },
  });

  // "Reputation fit" - distinct from the star rating it used to sit beside.
  assert.match(html, /Reputation fit/);
  assert.ok(
    !/>Rating</.test(html),
    `the bare label "Rating" is what made two different numbers look like one: ${html}`
  );
});

test("an unavailable reputation factor explains itself instead of showing 0%", () => {
  const html = render(MatchFactorsList, {
    matchFactors: { skill: 80, location: 70, availability: 100, pay: null, rating: null, relevance: 50 },
  });

  // The AI service reports an unrated worker as null rather than 0, and the UI
  // must say why rather than implying a bad score.
  assert.match(html, /Not rated yet, so reputation was not used/);
  assert.ok(!/Reputation fit \(0%\)/.test(html));
});

test("an available factor shows its percentage, clearly as a match figure", () => {
  const html = render(MatchFactorsList, {
    matchFactors: { skill: 80, location: null, availability: null, pay: null, rating: 75, relevance: null },
  });

  assert.match(html, /Skill \(80%\)/);
  assert.match(html, /Reputation fit \(75%\)/);
});
