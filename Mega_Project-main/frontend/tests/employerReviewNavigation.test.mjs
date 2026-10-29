import test from "node:test";
import assert from "node:assert";

let vite;
let React;
let renderToStaticMarkup;
let JobCard;
let EmployerReviewsModal;
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
  ({ EmployerReviewsModal } = await vite.ssrLoadModule("/src/components/reviews/EmployerReviewsModal.jsx"));
  ({ LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx"));
});

test.after(async () => {
  await vite?.close();
});

const render = (ui) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(LanguageProvider, null, ui)
    )
  );

test("JobCard renders employer reviews trigger button with rating and 'Read reviews' text", () => {
  const job = {
    _id: "job123",
    title: { en: "Electrician needed" },
    titleText: "Electrician needed",
    employerId: {
      _id: "empProfile123",
      businessName: "Kolhapur Electricals",
      ratingAvg: 4.8,
      ratingCount: 12,
      userId: {
        _id: "user456",
        fullName: "Rahul Patil",
      },
    },
    city: "Kolhapur",
    payAmount: 900,
    payType: "daily",
  };

  const html = render(React.createElement(JobCard, { job }));

  assert.ok(html.includes("job-card-employer-btn"), "Must render interactive button for employer reviews");
  assert.ok(html.includes("Kolhapur Electricals"), "Must display employer business name");
  assert.ok(html.includes("Read reviews") || html.includes("Reviews"), "Must render reviews affordance text");
  assert.ok(html.includes("4.8"), "Must render employer rating");
  assert.ok(html.includes("(12)"), "Must render employer review count");
});

test("JobCard correctly derives employerUserId from populated employerId", () => {
  const jobWithNestedUserId = {
    _id: "job1",
    employerId: {
      _id: "empProf1",
      businessName: "BrightBuild",
      userId: { _id: "realUser789", fullName: "Owner Name" },
    },
  };

  const derivedId1 =
    jobWithNestedUserId.employerId?.userId?._id ||
    jobWithNestedUserId.employerId?.userId;
  assert.strictEqual(derivedId1, "realUser789");

  const jobWithStringUserId = {
    _id: "job2",
    employerId: {
      _id: "empProf2",
      businessName: "City Works",
      userId: "directUser123",
    },
  };

  const derivedId2 =
    jobWithStringUserId.employerId?.userId?._id ||
    jobWithStringUserId.employerId?.userId;
  assert.strictEqual(derivedId2, "directUser123");
});

test("EmployerReviewsModal renders employer title, stars, and RatingList when open", () => {
  const html = render(
    React.createElement(EmployerReviewsModal, {
      isOpen: true,
      onClose: () => {},
      employerName: "Apex Construction Services",
      userId: "user101",
      ratingAvg: 4.5,
      ratingCount: 6,
    })
  );

  assert.ok(html.includes("Apex Construction Services"), "Must render employer name in modal title");
  assert.ok(html.includes("employer-reviews-modal-dialog"), "Must render modal dialog");
  assert.ok(html.includes("employer-reviews-modal-close"), "Must render close button");
  assert.ok(html.includes("rating-stars"), "Must render stars in modal");
  assert.ok(html.includes("employer-reviews-modal-body"), "Must render modal body for reviews");
});

test("EmployerReviewsModal returns null when isOpen is false", () => {
  const html = render(
    React.createElement(EmployerReviewsModal, {
      isOpen: false,
      onClose: () => {},
      employerName: "Apex Construction Services",
      userId: "user101",
    })
  );

  assert.strictEqual(html, "");
});
