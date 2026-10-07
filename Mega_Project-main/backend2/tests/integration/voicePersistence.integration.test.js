/**
 * Real-MongoDB regression for the reported defect: guided voice data not
 * staying in the worker's profile.
 *
 * WHAT WAS ACTUALLY WRONG (traced on a running server, not guessed):
 *   The confirm path was correct - it applied all six fields, including zeros.
 *   The data was lost AFTERWARDS, by WorkerProfileForm: it copies `profile` into
 *   useState at mount and never re-syncs, so once the voice flow saved new values
 *   the form still held the old ones and wrote them back on Save. Measured: a
 *   stale save reverted languages ["mr","hi"] -> ["mr"] and fullName
 *   "Swarup Pal" -> the pre-voice name.
 *
 * This file pins the BACKEND half of that invariant - that a confirmed guided
 * session really does land in MongoDB and survives the job lifecycle - so a
 * future change to the confirm path cannot reintroduce the symptom. The frontend
 * half is pinned in frontend/tests/profileFormSync.test.mjs.
 *
 * No AI service is needed: the draft is populated through the tap/manual path
 * (PATCH /guided/step), which is the same draft the voice steps write to.
 *
 *   cd backend2 && node --test tests/integration/voicePersistence.integration.test.js
 */

import test from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import VoiceProfile from "../../src/models/voiceProfile.model.js";
import WorkerProfile from "../../src/models/workerProfile.model.js";
import WorkerSkill from "../../src/models/workerSkill.model.js";
import EmployerProfile from "../../src/models/employerProfile.model.js";
import Application from "../../src/models/application.model.js";
import Job from "../../src/models/job.model.js";
import Rating from "../../src/models/rating.model.js";
import Skill from "../../src/models/skill.model.js";
import JobCategory from "../../src/models/jobCategory.model.js";
import { confirmAndApplyToProfile, setGuidedDraftField, startGuidedSession } from "../../src/controllers/voiceProfile.controller.js";

const TEST_DB = "LokRozgar_AI_voice_persistence_test";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

const id = () => new mongoose.Types.ObjectId();
let categoryId;
let electricianId;

test.before(async () => {
  await mongoose.connect(`${MONGODB_URI}/${TEST_DB}`);
  await Promise.all([VoiceProfile.init(), Application.init(), WorkerSkill.init()]);
  const category = await JobCategory.create({ name: { en: "Repair", hi: "मरम्मत", mr: "दुरुस्ती" }, isActive: true });
  categoryId = category._id;
  const skill = await Skill.create({
    name: { en: "Electrician", hi: "इलेक्ट्रिशियन", mr: "इलेक्ट्रिशियन" },
    categoryId,
    parentSkillId: null,
  });
  electricianId = skill._id;
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/** Drives a controller the way Express would, and returns what it answered. */
async function run(handler, { user, body = {}, query = {}, params = {} } = {}) {
  const req = { user, body, query, params };
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
  handler(req, res, (err) => settle({ error: err || null }));
  const { error } = await done;
  return { error, statusCode: res.statusCode, data: res.body?.data };
}

async function freshWorker(overrides = {}) {
  const userId = id();
  const profile = await WorkerProfile.create({
    userId,
    fullName: "Before Voice",
    languages: ["mr"],
    ...overrides,
  });
  return { user: { _id: userId }, profile };
}

/** The exact confirmedFields the wizard builds from a draft. */
const GUIDED_STEPS = ["fullName", "expectedPay", "experienceYears", "skills", "city", "languages", "availability"];
function buildConfirmedFields(draftFields) {
  const confirmed = {};
  for (const step of GUIDED_STEPS) {
    const value = draftFields?.[step];
    if (value !== null && value !== undefined && value !== "") confirmed[step] = value;
  }
  return confirmed;
}

async function completeGuidedSession(user, answers) {
  const started = await run(startGuidedSession, { user, body: { language: "mr" } });
  assert.strictEqual(started.error, null);
  for (const [field, value] of Object.entries(answers)) {
    const step = await run(setGuidedDraftField, { user, body: { language: "mr", field, value } });
    assert.strictEqual(step.error, null, `step ${field} failed: ${step.error?.message}`);
  }
  const draft = await VoiceProfile.findById(started.data.voiceProfileId);
  const confirmed = await run(confirmAndApplyToProfile, {
    user,
    body: { voiceProfileId: String(draft._id), confirmedFields: buildConfirmedFields(draft.draftFields) },
  });
  return { draftId: draft._id, confirmed };
}

test("a confirmed guided session lands every field in MongoDB", async () => {
  const { user, profile } = await freshWorker();

  const { confirmed } = await completeGuidedSession(user, {
    fullName: "Swarup Pal",
    expectedPay: 800,
    experienceYears: 5,
    city: "Kolhapur",
    languages: ["mr", "hi"],
    availability: "available",
  });
  assert.strictEqual(confirmed.error, null);
  assert.strictEqual(confirmed.statusCode, 200);

  // Read back from the database, not from the response.
  const saved = await WorkerProfile.findById(profile._id).lean();
  assert.strictEqual(saved.fullName, "Swarup Pal");
  assert.strictEqual(saved.expectedPay, 800);
  assert.strictEqual(saved.experienceYears, 5);
  assert.strictEqual(saved.city, "Kolhapur");
  assert.deepStrictEqual(saved.languages, ["mr", "hi"]);
  assert.strictEqual(saved.availability, "available");
});

test("the values survive a re-read, i.e. a page refresh or a fresh login", async () => {
  const { user, profile } = await freshWorker();
  await completeGuidedSession(user, {
    fullName: "Swarup Pal",
    expectedPay: 800,
    experienceYears: 5,
    city: "Kolhapur",
    languages: ["mr", "hi"],
    availability: "available",
  });

  // A refresh and a re-login both end in the same query the bootstrap makes.
  for (const attempt of [1, 2, 3]) {
    const reread = await WorkerProfile.findOne({ userId: user._id }).lean();
    assert.strictEqual(reread.expectedPay, 800, `lost on read ${attempt}`);
    assert.strictEqual(reread.experienceYears, 5);
    assert.strictEqual(reread.city, "Kolhapur");
    assert.deepStrictEqual(reread.languages, ["mr", "hi"]);
    assert.strictEqual(reread.fullName, "Swarup Pal");
  }
  assert.ok(profile._id);
});

test("a resolved skill becomes a WorkerSkill row pointing at the real catalog entry", async () => {
  const { user, profile } = await freshWorker();
  // "Electrician" matches the catalog by exact name, so Stage 1 resolves it and
  // the AI service is never called.
  const { confirmed } = await completeGuidedSession(user, {
    fullName: "Swarup Pal",
    skills: ["Electrician"],
  });

  assert.strictEqual(confirmed.error, null);
  const rows = await WorkerSkill.find({ workerId: profile._id }).lean();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(String(rows[0].skillId), String(electricianId), "must point at the catalog id, not an invented one");
  assert.deepStrictEqual(confirmed.data.voiceSkillResolution.skills.unresolved, []);
});

test("an unresolvable phrase is reported and creates nothing", async () => {
  const { user, profile } = await freshWorker();
  const { confirmed } = await completeGuidedSession(user, {
    fullName: "Swarup Pal",
    skills: ["a phrase that matches nothing in the catalog"],
  });

  assert.strictEqual(confirmed.error, null, "an unresolvable skill must not fail the confirm");
  assert.strictEqual(await WorkerSkill.countDocuments({ workerId: profile._id }), 0);
  assert.strictEqual(confirmed.data.voiceSkillResolution.skills.unresolved.length, 1);
  // And the rest of the profile still landed.
  assert.strictEqual((await WorkerProfile.findById(profile._id)).fullName, "Swarup Pal");
});

for (const [label, answers, expected] of [
  ["expectedPay = 0", { expectedPay: 0 }, { expectedPay: 0 }],
  ["experienceYears = 0", { experienceYears: 0 }, { experienceYears: 0 }],
  ["both zero together", { expectedPay: 0, experienceYears: 0 }, { expectedPay: 0, experienceYears: 0 }],
]) {
  test(`${label} persists as a real value`, async () => {
    // A fresher with no rate agreed yet. The old truthiness guard dropped these.
    const { user, profile } = await freshWorker({ expectedPay: 700, experienceYears: 9 });
    const { confirmed } = await completeGuidedSession(user, answers);
    assert.strictEqual(confirmed.error, null);

    const saved = await WorkerProfile.findById(profile._id).lean();
    for (const [field, value] of Object.entries(expected)) {
      assert.strictEqual(saved[field], value, `${field} should be ${value}, got ${saved[field]}`);
    }
  });
}

test("an unanswered step leaves the stored value alone", async () => {
  const { user, profile } = await freshWorker({ expectedPay: 700, experienceYears: 9, city: "Pune" });
  // Only the name is answered; everything else stays as the draft's null.
  const { confirmed } = await completeGuidedSession(user, { fullName: "Swarup Pal" });
  assert.strictEqual(confirmed.error, null);

  const saved = await WorkerProfile.findById(profile._id).lean();
  assert.strictEqual(saved.fullName, "Swarup Pal", "the answered field updates");
  assert.strictEqual(saved.expectedPay, 700, "an unanswered field must not be cleared");
  assert.strictEqual(saved.experienceYears, 9);
  assert.strictEqual(saved.city, "Pune");
});

test("the voice data survives hiring, completion, closure and a rating", async () => {
  const { user, profile } = await freshWorker();
  await completeGuidedSession(user, {
    fullName: "Swarup Pal",
    expectedPay: 800,
    experienceYears: 5,
    city: "Kolhapur",
    languages: ["mr", "hi"],
    availability: "available",
  });

  const snapshot = async () => {
    const p = await WorkerProfile.findById(profile._id).lean();
    return JSON.stringify({
      fullName: p.fullName,
      expectedPay: p.expectedPay,
      experienceYears: p.experienceYears,
      city: p.city,
      languages: p.languages,
      availability: p.availability,
    });
  };
  const before = await snapshot();

  const employerUserId = id();
  const employer = await EmployerProfile.create({
    userId: employerUserId,
    businessName: "Lifecycle Employer",
    businessType: "construction",
  });

  const job = await Job.create({
    employerId: employer._id,
    title: { en: "Wiring" },
    // Job.location is still required - only the PROFILE location became optional.
    location: { type: "Point", coordinates: [74.2433, 16.705] },
    payType: "daily",
    payAmount: 800,
    requiredWorkers: 1,
    startDate: new Date("2026-12-01"),
    categoryId,
    originalLanguage: "en",
    status: "open",
  });
  const application = await Application.create({
    jobId: job._id,
    workerId: profile._id,
    status: "accepted",
    initiatedBy: "worker",
  });

  await Application.findByIdAndUpdate(application._id, { status: "completed" });
  assert.strictEqual(await snapshot(), before, "completion must not disturb the voice data");

  await Job.findByIdAndUpdate(job._id, { status: "completed" });
  assert.strictEqual(await snapshot(), before, "closure must not disturb the voice data");

  await Rating.create({ jobId: job._id, fromUserId: employerUserId, toUserId: user._id, rating: 5 });
  assert.strictEqual(await snapshot(), before, "a rating must not disturb the voice data");
});

test("the session is marked committed, and re-confirming is harmless", async () => {
  const { user, profile } = await freshWorker();
  const { draftId } = await completeGuidedSession(user, { fullName: "Swarup Pal", expectedPay: 800 });

  const committed = await VoiceProfile.findById(draftId).lean();
  assert.strictEqual(committed.status, "committed");
  assert.ok(committed.committedAt);

  // Confirming the same session again applies the same values - idempotent, not
  // destructive.
  const again = await run(confirmAndApplyToProfile, {
    user,
    body: { voiceProfileId: String(draftId), confirmedFields: buildConfirmedFields(committed.draftFields) },
  });
  assert.strictEqual(again.error, null);
  const saved = await WorkerProfile.findById(profile._id).lean();
  assert.strictEqual(saved.fullName, "Swarup Pal");
  assert.strictEqual(saved.expectedPay, 800);
});

test("another worker cannot confirm this session", async () => {
  const { user } = await freshWorker();
  const { draftId } = await completeGuidedSession(user, { fullName: "Swarup Pal", expectedPay: 800 });

  const { user: other, profile: otherProfile } = await freshWorker({ fullName: "Other Worker" });
  const attempt = await run(confirmAndApplyToProfile, {
    user: other,
    body: { voiceProfileId: String(draftId), confirmedFields: { fullName: "Stolen" } },
  });

  assert.ok(attempt.error);
  assert.strictEqual(attempt.error.statusCode, 404);
  assert.strictEqual((await WorkerProfile.findById(otherProfile._id)).fullName, "Other Worker");
});
