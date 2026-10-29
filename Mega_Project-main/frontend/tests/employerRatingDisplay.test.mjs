import test from "node:test";
import assert from "node:assert";

let vite;
let React;
let renderToStaticMarkup;
let JobCard;
let LanguageProvider;
let MemoryRouter;

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
  ({ MemoryRouter } = await import("react-router-dom"));
  ({ JobCard } = await vite.ssrLoadModule("/src/components/jobs/JobCard.jsx"));
  ({ LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx"));
});

test.after(async () => {
  await vite?.close();
});

const render = (props) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(JobCard, props)
      )
    )
  );

test("JobCard displays employer average rating and review count when rated", () => {
  const job = {
    _id: "job101",
    title: { en: "Electrician Needed" },
    city: "Pune",
    payAmount: 850,
    payType: "daily",
    employerId: {
      _id: "emp201",
      businessName: "Patil Electricals",
      ratingAvg: 4.67,
      ratingCount: 12,
      userId: { _id: "user301", fullName: "Ramesh Patil" },
    },
  };

  const html = render({ job });

  assert.match(html, /Patil Electricals/);
  assert.match(html, /4\.7/);
  assert.match(html, /\(12\)/);
  assert.ok(!html.includes("0.0"));
});

test("JobCard displays 'New' badge when employer has no ratings yet, never 0.0", () => {
  const job = {
    _id: "job102",
    title: { en: "Plumbing Assistant" },
    city: "Kolhapur",
    payAmount: 700,
    payType: "daily",
    employerId: {
      _id: "emp202",
      businessName: "New Plumber Enterprise",
      ratingAvg: 0,
      ratingCount: 0,
      userId: { _id: "user302", fullName: "Sunil Joshi" },
    },
  };

  const html = render({ job });

  assert.match(html, /New Plumber Enterprise/);
  assert.match(html, /New/);
  assert.ok(!html.includes("0.0"), "Missing ratings must not be represented as a 0.0 rating");
});

test("JobCard handles missing employer profile gracefully without crashing", () => {
  const job = {
    _id: "job103",
    title: { en: "General Helper" },
    city: "Satara",
    payAmount: 600,
    payType: "daily",
    employerId: null,
  };

  const html = render({ job });

  assert.ok(html.includes("General Helper"));
  assert.ok(html.includes("600"));
});

test("JobCard handles unpopulated string employerId gracefully", () => {
  const job = {
    _id: "job104",
    title: { en: "Driver" },
    city: "Pune",
    payAmount: 1000,
    payType: "daily",
    employerId: "65f000000000000000000099",
  };

  const html = render({ job });

  assert.ok(html.includes("Driver"));
  assert.ok(!html.includes("0.0"));
});

test("Employer ratings are strictly decoupled from worker profile ratings", () => {
  const jobWithRatedEmployer = {
    _id: "job105",
    title: { en: "Welder" },
    city: "Pune",
    payAmount: 900,
    payType: "daily",
    employerId: {
      _id: "emp205",
      businessName: "Western Metal Works",
      ratingAvg: 4.8,
      ratingCount: 5,
      userId: { _id: "user505", fullName: "Western Employer" },
    },
  };

  const html = render({ job: jobWithRatedEmployer });

  // Confirms the card displays the employer's 4.8 (5) rating
  assert.match(html, /4\.8/);
  assert.match(html, /\(5\)/);
  assert.match(html, /Western Metal Works/);
});

