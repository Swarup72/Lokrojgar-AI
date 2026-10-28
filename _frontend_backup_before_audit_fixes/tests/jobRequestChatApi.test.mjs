import test from "node:test";
import assert from "node:assert";

// Wire contracts for the features added in this change: employer-initiated job
// requests, chat, the gated employer contact, and the display-name fallback.
//
// These pin the things that are invisible until a real user hits them: that the
// employer is never sent in a request body, that a worker's response goes to the
// right endpoint with the right field name, that chat polling asks only for new
// messages, and that an employer with no business name still renders a name.

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
let clientMod;
let applicationsApi;
let chatApi;
let jobsApi;
let authApi;
let displayName;

test.before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  clientMod = await vite.ssrLoadModule("/src/api/client.js");
  applicationsApi = await vite.ssrLoadModule("/src/api/applications.js");
  chatApi = await vite.ssrLoadModule("/src/api/chat.js");
  jobsApi = await vite.ssrLoadModule("/src/api/jobs.js");
  authApi = await vite.ssrLoadModule("/src/api/auth.js");
  displayName = await vite.ssrLoadModule("/src/utils/displayName.js");
});

test.after(async () => {
  await vite?.close();
});

/** Captures the outgoing request without any network call. */
async function capture(invoke, response = { data: { data: {} } }) {
  const client = clientMod.default;
  const original = client.defaults.adapter;
  let captured = null;
  client.defaults.adapter = async (config) => {
    captured = config;
    return { ...response, status: 200, statusText: "OK", headers: {}, config };
  };
  try {
    await invoke();
  } finally {
    client.defaults.adapter = original;
  }
  return captured;
}

const bodyOf = (config) => (typeof config.data === "string" ? JSON.parse(config.data) : config.data);

// --- job requests -----------------------------------------------------------

test("applications.invite posts the job and WORKER only - never the employer", async () => {
  const config = await capture(() =>
    applicationsApi.invite({ jobId: "JOB1", workerId: "WP1", proposedPay: 950 })
  );

  assert.strictEqual(config.method, "post");
  assert.ok(config.url.endsWith("/applications/invite"), `unexpected url: ${config.url}`);
  const body = bodyOf(config);
  assert.strictEqual(body.jobId, "JOB1");
  assert.strictEqual(body.workerId, "WP1");
  assert.strictEqual(body.proposedPay, 950);
  // The employer is derived from the JWT server-side. Sending it would be
  // meaningless at best and a spoofing attempt at worst.
  assert.strictEqual(body.employerId, undefined);
  assert.strictEqual(body.status, undefined, "the client does not get to choose the status");
  assert.strictEqual(body.matchScore, undefined, "the match score is the AI service's to set");
});

test("applications.getInvitations reads the worker's own requests", async () => {
  const config = await capture(() => applicationsApi.getInvitations(), { data: { data: [] } });
  assert.strictEqual(config.method, "get");
  assert.ok(config.url.endsWith("/applications/invitations"), `unexpected url: ${config.url}`);
});

for (const response of ["accepted", "declined"]) {
  test(`applications.respondToInvitation sends "${response}" under \`response\``, async () => {
    const config = await capture(() => applicationsApi.respondToInvitation("APP1", response));

    assert.strictEqual(config.method, "post");
    assert.ok(config.url.endsWith("/applications/APP1/respond"), `unexpected url: ${config.url}`);
    const body = bodyOf(config);
    assert.strictEqual(body.response, response);
    // The server reads `response`, not `status` - sending the wrong field name
    // would be a 400 the user could do nothing about.
    assert.strictEqual(body.status, undefined);
  });
}

// --- chat -------------------------------------------------------------------

test("chat.getOrCreateConversation sends only the job (worker) or job + worker (employer)", async () => {
  const workerSide = await capture(() => chatApi.getOrCreateConversation({ jobId: "JOB1" }));
  assert.deepStrictEqual(bodyOf(workerSide), { jobId: "JOB1" });

  const employerSide = await capture(() =>
    chatApi.getOrCreateConversation({ jobId: "JOB1", workerId: "WP1" })
  );
  const body = bodyOf(employerSide);
  assert.strictEqual(body.jobId, "JOB1");
  assert.strictEqual(body.workerId, "WP1");
  // participantIds are derived server-side from the hiring relationship.
  assert.strictEqual(body.participantIds, undefined);
  assert.strictEqual(body.employerId, undefined);
});

test("chat.listMessages omits `after` on a first load and sends it when polling", async () => {
  const first = await capture(() => chatApi.listMessages("C1"), { data: { data: [] } });
  assert.strictEqual(first.method, "get");
  assert.ok(first.url.endsWith("/chat/conversations/C1/messages"), `unexpected url: ${first.url}`);
  assert.deepStrictEqual(first.params, {}, "a first load must not send an empty after=");

  const since = "2026-01-01T00:00:00.000Z";
  const polled = await capture(() => chatApi.listMessages("C1", since), { data: { data: [] } });
  assert.deepStrictEqual(polled.params, { after: since }, "polling must ask only for what is new");
});

test("chat.sendMessage posts the text to the conversation's own endpoint", async () => {
  const config = await capture(() => chatApi.sendMessage("C1", "On my way"));
  assert.strictEqual(config.method, "post");
  assert.ok(config.url.endsWith("/chat/conversations/C1/messages"), `unexpected url: ${config.url}`);
  const body = bodyOf(config);
  assert.strictEqual(body.text, "On my way");
  // The sender comes from the token; a conversationId in the body would be
  // ignored and is not sent.
  assert.strictEqual(body.senderId, undefined);
  assert.strictEqual(body.conversationId, undefined);
});

test("chat.markRead patches the conversation's read state", async () => {
  const config = await capture(() => chatApi.markRead("C1"));
  assert.strictEqual(config.method, "patch");
  assert.ok(config.url.endsWith("/chat/conversations/C1/read"), `unexpected url: ${config.url}`);
});

// --- gated employer contact -------------------------------------------------

test("jobs.getEmployerContact reads the job's own gated contact endpoint", async () => {
  const config = await capture(() => jobsApi.getEmployerContact("JOB1"));
  assert.strictEqual(config.method, "get");
  assert.ok(config.url.endsWith("/jobs/JOB1/employer-contact"), `unexpected url: ${config.url}`);
});

// --- role activation --------------------------------------------------------

test("auth.addRole posts the role to the signed-in account", async () => {
  const config = await capture(() => authApi.addRole({ role: "employer", fullName: "Samarth" }));
  assert.strictEqual(config.method, "post");
  assert.ok(config.url.endsWith("/auth/add-role"), `unexpected url: ${config.url}`);
  const body = bodyOf(config);
  assert.strictEqual(body.role, "employer");
  // No user id: the account is the one holding the token, never one named in a
  // body - that would be a privilege-escalation vector.
  assert.strictEqual(body.userId, undefined);
  assert.strictEqual(body._id, undefined);
});

// --- the display-name fallback ----------------------------------------------

test("employerName falls back from business name to the person's own name", () => {
  const { employerName } = displayName;

  assert.strictEqual(employerName({ businessName: "Patil Builders" }), "Patil Builders");
  // The product change: an employer registering with no business name is shown
  // by their own name, which job reads supply as employerId.userId.fullName.
  assert.strictEqual(employerName({ businessName: null, userId: { fullName: "Rahul Patil" } }), "Rahul Patil");
  assert.strictEqual(employerName({ businessName: "  ", userId: { fullName: "Rahul Patil" } }), "Rahul Patil");
  // Nothing on record: null, so the caller decides - no invented placeholder.
  assert.strictEqual(employerName({ businessName: null, userId: { fullName: null } }), null);
  // An unpopulated employerId arrives as a bare id string, not an object.
  assert.strictEqual(employerName("507f1f77bcf86cd799480002"), null);
  assert.strictEqual(employerName(null), null);
});

test("ownEmployerName uses the signed-in account's own name when there is no business", () => {
  const { ownEmployerName } = displayName;
  assert.strictEqual(ownEmployerName({ businessName: "Acme" }, { fullName: "Rahul" }), "Acme");
  assert.strictEqual(ownEmployerName({ businessName: null }, { fullName: "Rahul" }), "Rahul");
  assert.strictEqual(ownEmployerName(null, { fullName: "Rahul" }), "Rahul");
  assert.strictEqual(ownEmployerName(null, null), null);
});
