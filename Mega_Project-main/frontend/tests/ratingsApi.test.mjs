import test from "node:test";
import assert from "node:assert";

// MODULE 5 (Reviews & Ratings) wire contract.
//
// Two things here are easy to get wrong and invisible until a real user
// tries to rate someone:
//   - the body field is `score`, NOT `rating` (the Rating model's field is
//     `rating`, but the controller reads `score` from the body);
//   - POST /ratings now rejects a fractional score with a 400, so the form
//     must only ever be able to produce a whole 1-5 star.
// The review length cap the backend enforces (1000) is mirrored in the form
// and pinned here so the two cannot drift.

const store = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
});
globalThis.window = { dispatchEvent: () => true };

let vite;
let ratingsApi;
let clientMod;
let ratingForm;

test.before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  clientMod = await vite.ssrLoadModule("/src/api/client.js");
  ratingsApi = await vite.ssrLoadModule("/src/api/ratings.js");
  ratingForm = await vite.ssrLoadModule("/src/components/reviews/RatingForm.jsx");
});

test.after(async () => {
  await vite?.close();
});

/** Captures the outgoing request without any network call. */
async function capture(invoke) {
  const client = clientMod.default;
  const original = client.defaults.adapter;
  let captured = null;
  client.defaults.adapter = async (config) => {
    captured = config;
    return { data: { data: {} }, status: 200, statusText: "OK", headers: {}, config };
  };
  try {
    await invoke();
  } finally {
    client.defaults.adapter = original;
  }
  return captured;
}

test("ratings.submit posts the score under `score`, never `rating`", async () => {
  const config = await capture(() =>
    ratingsApi.submit({ jobId: "JOB1", toUserId: "USER1", score: 4, review: "Good work" })
  );

  assert.strictEqual(config.method, "post");
  assert.ok(config.url.endsWith("/ratings"), `unexpected url: ${config.url}`);

  const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  assert.strictEqual(body.score, 4);
  assert.strictEqual(body.rating, undefined, "the backend reads `score` from the body - `rating` would be dropped");
  assert.strictEqual(body.jobId, "JOB1");
  assert.strictEqual(body.toUserId, "USER1");
  assert.strictEqual(body.review, "Good work");
  // fromUserId is derived from the JWT server-side and must never be sent.
  assert.strictEqual(body.fromUserId, undefined);
});

test("ratings.submit sends every whole star 1..5 as a number, not a string", async () => {
  for (const score of [1, 2, 3, 4, 5]) {
    const config = await capture(() => ratingsApi.submit({ jobId: "JOB1", toUserId: "USER1", score }));
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    assert.strictEqual(body.score, score);
    assert.strictEqual(typeof body.score, "number", "a string score is rejected with a 400");
  }
});

test("ratings.submit omits an empty review rather than sending an empty string", async () => {
  const config = await capture(() =>
    ratingsApi.submit({ jobId: "JOB1", toUserId: "USER1", score: 5, review: undefined })
  );
  const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  assert.strictEqual("review" in body, false);
});

test("ratings.getForUser reads the ratings of the given user", async () => {
  const config = await capture(() => ratingsApi.getForUser("USER42"));
  assert.strictEqual(config.method, "get");
  assert.ok(config.url.endsWith("/ratings/user/USER42"), `unexpected url: ${config.url}`);
});

test("the rating form's review cap matches the backend's MAX_REVIEW_LENGTH", async () => {
  // backend2/src/validators/rating.validator.js exports the same number; a
  // larger value here would let the user write a review that bounces as 400.
  assert.strictEqual(ratingForm.MAX_REVIEW_LENGTH, 1000);
});
