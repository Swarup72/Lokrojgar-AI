import test from "node:test";
import assert from "node:assert";

let vite;
let React;
let renderToStaticMarkup;
let MatchFactorsList;
let LanguageProvider;

test.before(async () => {
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

  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ MatchFactorsList } = await vite.ssrLoadModule(
    "/src/components/recommendations/MatchFactorsList.jsx"
  ));
  ({ LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx"));
});

test.after(async () => {
  await vite?.close();
});

const render = (props) =>
  renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      null,
      React.createElement(MatchFactorsList, props)
    )
  );

test("Pay factor displays as available with percentage when pay score is present", () => {
  const matchFactors = {
    skill: 100,
    location: 95,
    availability: 100,
    pay: 100,
    rating: null,
    relevance: 80,
  };

  const html = render({ matchFactors });

  assert.match(html, /Pay \(100%\)/);
  assert.ok(html.includes('class="available"'));
});

test("Pay factor displays proportional percentage when pay is partially matched", () => {
  const matchFactors = {
    skill: 100,
    location: 80,
    availability: 100,
    pay: 88.9,
    rating: null,
    relevance: 75,
  };

  const html = render({ matchFactors });

  assert.match(html, /Pay \(89%\)/);
});

test("Pay factor displays as unavailable when pay is null", () => {
  const matchFactors = {
    skill: 100,
    location: 80,
    availability: 100,
    pay: null,
    rating: null,
    relevance: 75,
  };

  const html = render({ matchFactors });

  // When null, it must NOT show a percentage
  assert.ok(!html.includes("Pay ("));
  assert.match(html, /Pay/);
});

test("Distinguishes between a missing pay score (null) and a real score of 0", () => {
  const factorsWithZero = {
    skill: 100,
    location: 80,
    availability: 100,
    pay: 0,
    rating: null,
    relevance: 75,
  };

  const htmlZero = render({ matchFactors: factorsWithZero });
  assert.match(htmlZero, /Pay \(0%\)/, "A genuine zero score must display as 0%, not as unavailable");

  const factorsWithNull = {
    skill: 100,
    location: 80,
    availability: 100,
    pay: null,
    rating: null,
    relevance: 75,
  };

  const htmlNull = render({ matchFactors: factorsWithNull });
  assert.ok(!htmlNull.includes("Pay (0%)"), "A null score must not display as 0%");
});

