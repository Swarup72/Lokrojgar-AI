/**
 * Skills and sub-skills.
 *
 * A sub-skill is an ordinary Skill document with `parentSkillId` set, in the
 * same collection - which is exactly what lets sub-skills influence matching
 * without changing the frozen ranking. For a job needing
 * [Electrician, Wire Connection], the existing |matched| / |required| score
 * gives 2/2 to a worker with both, 1/2 with the trade only, and 0/2 to a
 * plumber. These tests cover the two pieces that are NOT free:
 *
 *   1. adding a sub-skill also records its parent trade (claiming "Wire
 *      Connection" is claiming to be an electrician) - without this, a worker
 *      who picked only sub-skills would score 0 against a job asking for the
 *      trade;
 *   2. the catalog stays exactly one level deep.
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import Skill from "../src/models/skill.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import { addWorkerSkill } from "../src/controllers/workerSkill.controller.js";
import { createSkill, getSkills } from "../src/controllers/categorySkill.controller.js";
import { calculateSkillScoreForTest } from "./helpers/skillScore.js";

const WORKER_USER = "507f1f77bcf86cd799470001";
const WORKER_PROFILE_ID = "507f1f77bcf86cd799470002";
const TRADE_ID = "507f1f77bcf86cd799470003";
const SUB_SKILL_ID = "507f1f77bcf86cd799470004";
const CATEGORY_ID = "507f1f77bcf86cd799470005";

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

function mockAddSkill(t, { skill, createImpl = null, upsertedId = "WS_PARENT" } = {}) {
  const updates = [];
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => ({ _id: WORKER_PROFILE_ID, userId: WORKER_USER })),
    mock.method(Skill, "findById", async (id) => (String(id) === String(skill?._id) ? skill : null)),
    mock.method(
      WorkerSkill,
      "create",
      createImpl || (async (doc) => ({ _id: "WS1", ...doc }))
    ),
    mock.method(WorkerSkill, "updateOne", async (filter, update, options) => {
      updates.push({ filter, update, options });
      return { upsertedId };
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
  return { updates };
}

const trade = { _id: TRADE_ID, name: { en: "Electrician" }, parentSkillId: null, categoryId: CATEGORY_ID };
const subSkill = {
  _id: SUB_SKILL_ID,
  name: { en: "Wire Connection" },
  parentSkillId: TRADE_ID,
  categoryId: CATEGORY_ID,
};

// --- the parent implication -------------------------------------------------

test("adding a SUB-SKILL also records its parent trade", async (t) => {
  const { updates } = mockAddSkill(t, { skill: subSkill });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { skillId: SUB_SKILL_ID, proficiency: "expert" },
  });
  addWorkerSkill(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(updates.length, 1, "the trade must be recorded alongside the sub-skill");
  assert.strictEqual(String(updates[0].filter.skillId), TRADE_ID);
  assert.strictEqual(String(updates[0].filter.workerId), WORKER_PROFILE_ID);
  assert.strictEqual(updates[0].options.upsert, true, "upsert is what makes this safe to race");
  assert.ok(updates[0].update.$setOnInsert, "an existing claim must never be downgraded or rewritten");
  assert.strictEqual(
    updates[0].update.$setOnInsert.proficiency,
    "expert",
    "the implied trade inherits the sub-skill's proficiency, never a higher one"
  );
  assert.strictEqual(res.body.data.impliedParentSkill, "WS_PARENT");
});

test("adding a TRADE implies nothing extra", async (t) => {
  const { updates } = mockAddSkill(t, { skill: trade });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { skillId: TRADE_ID },
  });
  addWorkerSkill(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(updates.length, 0, "a trade has no parent to imply");
  assert.strictEqual(res.body.data.impliedParentSkill, null);
});

test("the implied trade is not reported again when the worker already claims it", async (t) => {
  // upsert matched an existing row, so there is no upsertedId.
  const { updates } = mockAddSkill(t, { skill: subSkill, upsertedId: null });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { skillId: SUB_SKILL_ID },
  });
  addWorkerSkill(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(res.body.data.impliedParentSkill, null);
});

test("an unknown skill id is a 404 and nothing is stored", async (t) => {
  const { updates } = mockAddSkill(t, { skill: null });
  const createMock = mock.method(WorkerSkill, "create", async () => {
    throw new Error("nothing may be stored for an unknown skill");
  });
  t.after(() => createMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { skillId: "507f1f77bcf86cd7994700ff" },
  });
  addWorkerSkill(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(updates.length, 0);
});

test("adding the same skill twice is a 409, not a 500", async (t) => {
  mockAddSkill(t, {
    skill: subSkill,
    createImpl: async () => {
      throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
    },
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: WORKER_USER },
    body: { skillId: SUB_SKILL_ID },
  });
  addWorkerSkill(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 409, "the unique {workerId, skillId} index surfaced as a raw 500 before");
});

// --- the catalog stays one level deep --------------------------------------

test("createSkill rejects a sub-skill of a sub-skill", async (t) => {
  const findByIdMock = mock.method(Skill, "findById", async () => subSkill);
  const createMock = mock.method(Skill, "create", async () => {
    throw new Error("the hierarchy must stay one level deep");
  });
  t.after(() => {
    findByIdMock.mock.restore();
    createMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: "ADMIN" },
    body: { name: { en: "Too Deep" }, categoryId: CATEGORY_ID, parentSkillId: SUB_SKILL_ID },
  });
  createSkill(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 400);
  assert.strictEqual(createMock.mock.callCount(), 0);
});

test("createSkill rejects an unknown parent skill", async (t) => {
  const findByIdMock = mock.method(Skill, "findById", async () => null);
  const createMock = mock.method(Skill, "create", async () => {
    throw new Error("must not create an orphan sub-skill");
  });
  t.after(() => {
    findByIdMock.mock.restore();
    createMock.mock.restore();
  });

  const { req, res, next, done } = fakeReqRes({
    body: { name: { en: "Orphan" }, categoryId: CATEGORY_ID, parentSkillId: "507f1f77bcf86cd7994700fe" },
  });
  createSkill(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
});

test("createSkill: a trade is created with parentSkillId explicitly null", async (t) => {
  let created = null;
  const createMock = mock.method(Skill, "create", async (doc) => {
    created = doc;
    return { _id: "NEW", ...doc };
  });
  t.after(() => createMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({
    body: { name: { en: "Welding" }, categoryId: CATEGORY_ID },
  });
  createSkill(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(created.parentSkillId, null, "stored as null, not left undefined");
});

// --- the catalog read exposes the hierarchy --------------------------------

test("getSkills returns parentSkillId so the UI can group trades and sub-skills", async (t) => {
  const findMock = mock.method(Skill, "find", () => ({
    populate: async () => [
      { ...trade, categoryId: { _id: CATEGORY_ID, name: { en: "Repair" } } },
      { ...subSkill, categoryId: { _id: CATEGORY_ID, name: { en: "Repair" } } },
    ],
  }));
  t.after(() => findMock.mock.restore());

  const { req, res, next, done } = fakeReqRes({ query: {} });
  getSkills(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  const [tradeRow, subRow] = res.body.data;
  assert.strictEqual(tradeRow.parentSkillId, null);
  assert.strictEqual(String(subRow.parentSkillId), TRADE_ID);
  assert.strictEqual(tradeRow.name, "Electrician");
  assert.strictEqual(subRow.name, "Wire Connection");
});

test("getSkills supports filtering to one trade's sub-skills, and to trades only", async (t) => {
  const filters = [];
  const findMock = mock.method(Skill, "find", (filter) => {
    filters.push(filter);
    return { populate: async () => [] };
  });
  t.after(() => findMock.mock.restore());

  for (const query of [{ parentSkillId: TRADE_ID }, { topLevel: "true" }, { categoryId: CATEGORY_ID }]) {
    const { req, res, next, done } = fakeReqRes({ query });
    getSkills(req, res, next);
    await done;
  }

  assert.strictEqual(String(filters[0].parentSkillId), TRADE_ID);
  assert.strictEqual(filters[1].parentSkillId, null, "topLevel=true means trades only");
  assert.strictEqual(String(filters[2].categoryId), CATEGORY_ID);
  assert.ok(filters.every((f) => f.isActive === true), "a deactivated skill must never be offered");
});

// --- the ordering the product asks for, against the real scoring formula ----

test("the existing skill score already ranks sub-skill matches above trade-only", async () => {
  // Mirrors ai-service/app/matching/skill_match.py: |matched| / |required| * 100.
  const required = [TRADE_ID, SUB_SKILL_ID];

  const both = calculateSkillScoreForTest([TRADE_ID, SUB_SKILL_ID], required);
  const tradeOnly = calculateSkillScoreForTest([TRADE_ID], required);
  const differentTrade = calculateSkillScoreForTest(["507f1f77bcf86cd7994700aa"], required);

  assert.strictEqual(both, 100);
  assert.strictEqual(tradeOnly, 50);
  assert.strictEqual(differentTrade, 0);
  assert.ok(both > tradeOnly && tradeOnly > differentTrade, "this is the ordering the product requires");
});
