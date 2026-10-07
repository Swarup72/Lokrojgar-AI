/**
 * Chat authorization, IDOR and message validation.
 *
 * The previous chat controller had none of this. Measured on an isolated
 * database before the rewrite:
 *
 *   - POST /chat/conversations took jobId/workerId/employerId from the request
 *     body with no relationship check and returned 200 to a worker with no
 *     application at all;
 *   - every conversation was stored with participantIds: [] (the controller
 *     wrote fields the schema did not declare), so nothing recorded who was
 *     allowed in and "my conversations" always returned 0;
 *   - an unrelated third user could READ another pair's messages (HTTP 200) and
 *     POST into their conversation (HTTP 201);
 *   - a whitespace-only message was accepted (HTTP 201).
 *
 * Each of those is a test below.
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import Job from "../src/models/job.model.js";
import Application from "../src/models/application.model.js";
import Conversation from "../src/models/conversation.model.js";
import Message from "../src/models/message.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import {
  getOrCreateConversation,
  sendMessage,
  listMessages,
  markMessagesRead,
} from "../src/controllers/chat.controller.js";

const JOB_ID = "507f1f77bcf86cd799450001";
const EMPLOYER_PROFILE_ID = "507f1f77bcf86cd799450002";
const EMPLOYER_USER = "507f1f77bcf86cd799450003";
const WORKER_PROFILE_ID = "507f1f77bcf86cd799450004";
const WORKER_USER = "507f1f77bcf86cd799450005";
const OUTSIDER_USER = "507f1f77bcf86cd799450006";
const OUTSIDER_PROFILE_ID = "507f1f77bcf86cd799450007";
const CONVERSATION_ID = "507f1f77bcf86cd799450008";

function fakeReqRes({ user, body = {}, params = {}, query = {} } = {}) {
  const req = { user, body, params, query };
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      settle({ error: null });
      return this;
    },
  };
  return { req, res, next: (err) => settle({ error: err || null }), done };
}

const job = () => ({ _id: JOB_ID, employerId: EMPLOYER_PROFILE_ID, status: "assigned" });

const conversation = (overrides = {}) => ({
  _id: CONVERSATION_ID,
  jobId: JOB_ID,
  workerId: WORKER_PROFILE_ID,
  employerId: EMPLOYER_PROFILE_ID,
  // The two User ids the SERVER wrote - authorization is checked against these.
  participantIds: [WORKER_USER, EMPLOYER_USER],
  ...overrides,
});

/**
 * @param {object} options
 * @param {string|null} options.applicationStatus - the status of the Application
 *   linking this worker to this job, or null for "no application at all".
 */
function mockChat(t, { applicationStatus = "accepted", conversationDoc = conversation() } = {}) {
  const mocks = [
    mock.method(Job, "findById", async () => job()),
    mock.method(WorkerProfile, "findOne", async ({ userId }) => {
      if (String(userId) === WORKER_USER) return { _id: WORKER_PROFILE_ID, userId: WORKER_USER };
      if (String(userId) === OUTSIDER_USER) return { _id: OUTSIDER_PROFILE_ID, userId: OUTSIDER_USER };
      return null;
    }),
    mock.method(EmployerProfile, "findOne", async ({ userId }) =>
      String(userId) === EMPLOYER_USER ? { _id: EMPLOYER_PROFILE_ID, userId: EMPLOYER_USER } : null
    ),
    mock.method(WorkerProfile, "findById", async () => ({ _id: WORKER_PROFILE_ID, userId: WORKER_USER })),
    mock.method(EmployerProfile, "findById", async () => ({ _id: EMPLOYER_PROFILE_ID, userId: EMPLOYER_USER })),
    // The mock answers only the filter it is given, exactly as MongoDB would -
    // so a controller asking for an accepted application genuinely finds nothing
    // when the application is merely "invited".
    mock.method(Application, "findOne", async (filter) => {
      if (!applicationStatus) return null;
      const wanted = filter.status?.$in;
      if (wanted && !wanted.includes(applicationStatus)) return null;
      if (filter.workerId && String(filter.workerId) !== WORKER_PROFILE_ID) return null;
      return { _id: "APP1", jobId: JOB_ID, workerId: WORKER_PROFILE_ID, status: applicationStatus };
    }),
    mock.method(Conversation, "findById", async () => conversationDoc),
    mock.method(Conversation, "findOne", async () => conversationDoc),
    mock.method(Conversation, "updateOne", async () => ({ modifiedCount: 1 })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
}

// =============================================================================
// Opening a conversation requires a real, accepted hiring relationship
// =============================================================================

test("a worker with NO application cannot open a conversation", async (t) => {
  mockChat(t, { applicationStatus: null });
  const createMock = mock.method(Conversation, "create", async () => {
    throw new Error("no conversation may be created without a relationship");
  });
  t.after(() => createMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: OUTSIDER_USER },
    body: { jobId: JOB_ID },
  });
  getOrCreateConversation(req, res, next);
  const { error } = await done;

  assert.ok(error, "this returned HTTP 200 before the rewrite");
  assert.strictEqual(error.statusCode, 403);
  assert.strictEqual(createMock.mock.callCount(), 0);
});

for (const status of ["applied", "invited", "shortlisted", "rejected", "declined", "withdrawn"]) {
  test(`chat does NOT open on an application that is only "${status}"`, async (t) => {
    mockChat(t, { applicationStatus: status });

    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      body: { jobId: JOB_ID },
    });
    getOrCreateConversation(req, res, next);
    const { error } = await done;

    assert.ok(error, `"${status}" must not open a chat channel`);
    assert.strictEqual(error.statusCode, 403);
  });
}

for (const status of ["accepted", "completed"]) {
  test(`chat DOES open on an "${status}" application`, async (t) => {
    mockChat(t, { applicationStatus: status });

    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      body: { jobId: JOB_ID },
    });
    getOrCreateConversation(req, res, next);
    const { error } = await done;

    assert.strictEqual(error, null);
    assert.strictEqual(res.statusCode, 200);
  });
}

test("a NEW conversation records both participants, derived server-side", async (t) => {
  mockChat(t, { conversationDoc: null });
  let createdDoc = null;
  const createMock = mock.method(Conversation, "create", async (doc) => {
    createdDoc = doc;
    return { _id: CONVERSATION_ID, ...doc };
  });
  t.after(() => createMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    // A hostile body: these must be ignored in favour of the real relationship.
    body: { jobId: JOB_ID, employerId: OUTSIDER_USER, participantIds: [OUTSIDER_USER] },
  });
  getOrCreateConversation(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.deepStrictEqual(
    createdDoc.participantIds.map(String).sort(),
    [WORKER_USER, EMPLOYER_USER].sort(),
    "participantIds was stored EMPTY before the rewrite, and must never come from the body"
  );
  assert.strictEqual(String(createdDoc.workerId), WORKER_PROFILE_ID);
  assert.strictEqual(String(createdDoc.employerId), EMPLOYER_PROFILE_ID);
});

test("a concurrent duplicate conversation (E11000) returns the existing one, not a 500", async (t) => {
  // findOne is consulted twice: empty on the pre-check, then the winner's row.
  let lookups = 0;
  const findOneMock = mock.method(Conversation, "findOne", async () =>
    (lookups += 1) === 1 ? null : conversation()
  );
  mockChat(t);
  findOneMock.mock.restore();
  const realFindOne = mock.method(Conversation, "findOne", async () =>
    (lookups += 1) === 1 ? null : conversation()
  );
  const createMock = mock.method(Conversation, "create", async () => {
    throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
  });
  t.after(() => {
    realFindOne.mock.restore();
    createMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { jobId: JOB_ID },
  });
  getOrCreateConversation(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(String(res.body.data._id), CONVERSATION_ID);
});

// =============================================================================
// IDOR: a conversation id alone must grant nothing
// =============================================================================

const IDOR_CASES = [
  ["reading messages", listMessages],
  ["marking messages read", markMessagesRead],
];

for (const [label, handler] of IDOR_CASES) {
  test(`IDOR: an unrelated user is refused when ${label} by conversation id`, async (t) => {
    mockChat(t);

    const { req, res, next, done } = fakeReqRes({
      user: { _id: OUTSIDER_USER },
      params: { conversationId: CONVERSATION_ID },
    });
    handler(req, res, next);
    const { error } = await done;

    assert.ok(error, `${label} returned 200 for an outsider before the rewrite`);
    assert.strictEqual(
      error.statusCode,
      404,
      "404, not 403 - someone else's conversation must not be confirmed to exist"
    );
  });
}

test("IDOR: an unrelated user cannot POST a message into another pair's conversation", async (t) => {
  mockChat(t);
  const createMock = mock.method(Message, "create", async () => {
    throw new Error("an outsider must never write a message");
  });
  t.after(() => createMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: OUTSIDER_USER },
    params: { conversationId: CONVERSATION_ID },
    body: { text: "injected" },
  });
  sendMessage(req, res, next);
  const { error } = await done;

  assert.ok(error, "this returned HTTP 201 before the rewrite");
  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(createMock.mock.callCount(), 0);
});

test("a malformed conversation id is a 400, never a 500", async (t) => {
  mockChat(t);

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { conversationId: "not-an-object-id" },
    body: { text: "hello" },
  });
  sendMessage(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

test("an unknown conversation id is a 404", async (t) => {
  mockChat(t, { conversationDoc: null });
  const findByIdMock = mock.method(Conversation, "findById", async () => null);
  t.after(() => findByIdMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { conversationId: CONVERSATION_ID },
    body: { text: "hello" },
  });
  sendMessage(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
});

test("a participant loses access once the application is no longer accepted", async (t) => {
  // The relationship is re-checked on every read/write, so revoking it closes
  // the channel rather than leaving a permanently open back door.
  mockChat(t, { applicationStatus: "withdrawn" });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { conversationId: CONVERSATION_ID },
  });
  listMessages(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 403);
});

// =============================================================================
// Message content
// =============================================================================

test("sendMessage: the sender is taken from the token, never from the body", async (t) => {
  mockChat(t);
  let created = null;
  const createMock = mock.method(Message, "create", async (doc) => {
    created = doc;
    return { _id: "M1", ...doc, createdAt: new Date() };
  });
  t.after(() => createMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { conversationId: CONVERSATION_ID },
    body: { text: "On my way", senderId: OUTSIDER_USER, isRead: true },
  });
  sendMessage(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(String(created.senderId), WORKER_USER, "a spoofed senderId must be ignored");
  assert.strictEqual(created.text, "On my way");
  assert.strictEqual(created.messageType, "text");
});

for (const [label, text] of [
  ["empty string", ""],
  ["whitespace only", "   "],
  ["tabs and newlines only", "\t\n  \n"],
  ["missing", undefined],
  ["a number", 42],
  ["an object", { toString: () => "x" }],
]) {
  test(`sendMessage rejects ${label} with 400 and stores nothing`, async (t) => {
    mockChat(t);
    const createMock = mock.method(Message, "create", async () => {
      throw new Error("an empty message must never be stored");
    });
    t.after(() => createMock.mock.restore());

    const { req, res, next, done } = fakeReqRes({
      user: { _id: WORKER_USER },
      params: { conversationId: CONVERSATION_ID },
      body: text === undefined ? {} : { text },
    });
    sendMessage(req, res, next);
    const { error } = await done;

    assert.ok(error, `${label} was accepted with HTTP 201 before the rewrite`);
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(createMock.mock.callCount(), 0);
  });
}

test("sendMessage rejects an over-long message at the controller, not just the validator", async (t) => {
  mockChat(t);
  const createMock = mock.method(Message, "create", async () => {
    throw new Error("an over-long message must never be stored");
  });
  t.after(() => createMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { conversationId: CONVERSATION_ID },
    body: { text: "x".repeat(2001) },
  });
  sendMessage(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(createMock.mock.callCount(), 0);
});

test("markMessagesRead only marks the OTHER party's messages", async (t) => {
  mockChat(t);
  let capturedFilter = null;
  const updateManyMock = mock.method(Message, "updateMany", async (filter) => {
    capturedFilter = filter;
    return { modifiedCount: 2 };
  });
  t.after(() => updateManyMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { conversationId: CONVERSATION_ID },
  });
  markMessagesRead(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.deepStrictEqual(capturedFilter.senderId, { $ne: WORKER_USER }, "a sender cannot mark their own as read");
  assert.strictEqual(capturedFilter.isRead, false);
  assert.strictEqual(String(capturedFilter.conversationId), CONVERSATION_ID);
});

test("listMessages: an invalid 'after' timestamp is a 400, not an unbounded fetch", async (t) => {
  mockChat(t);
  const findMock = mock.method(Message, "find", () => {
    throw new Error("must not query with an invalid timestamp");
  });
  t.after(() => findMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { conversationId: CONVERSATION_ID },
    query: { after: "yesterday-ish" },
  });
  listMessages(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
});

test("listMessages: a valid 'after' narrows the query and caps the page size", async (t) => {
  mockChat(t);
  let capturedFilter = null;
  let capturedLimit = null;
  const findMock = mock.method(Message, "find", (filter) => ({
    sort: () => ({
      limit: async (value) => {
        capturedFilter = filter;
        capturedLimit = value;
        return [];
      },
    }),
  }));
  t.after(() => findMock.mock.restore());

  const since = "2026-01-01T00:00:00.000Z";
  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    params: { conversationId: CONVERSATION_ID },
    query: { after: since },
  });
  listMessages(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.deepStrictEqual(capturedFilter.createdAt, { $gt: new Date(since) });
  assert.strictEqual(typeof capturedLimit, "number");
  assert.ok(capturedLimit > 0 && capturedLimit <= 200, `page size must be bounded, got ${capturedLimit}`);
});
