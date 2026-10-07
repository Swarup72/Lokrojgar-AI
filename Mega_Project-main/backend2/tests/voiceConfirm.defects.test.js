/**
 * The two defects found in the voice-profile redesign audit.
 *
 * DEFECT 1 - zero was treated as "not answered".
 *   Every assignment in confirmAndApplyToProfile was guarded with plain
 *   truthiness (`if (confirmedFields.experienceYears)`), which cannot tell a
 *   worker who did not answer apart from a worker who answered ZERO. Measured:
 *   confirming experienceYears = 0 against a stored 5 left it at 5, so a
 *   fresher could not record that they have no experience - even though the
 *   schema declares `min: 0` and 0 is a legitimate value.
 *
 * DEFECT 2 - no ownership check on the VoiceProfile.
 *   The endpoint read `voiceProfileId` from the request body and looked it up
 *   with VoiceProfile.findById(), never checking that the document belonged to
 *   the authenticated worker. The write landed on the caller's own profile, but
 *   another worker's `language` and `transcript` were read, and that transcript
 *   was passed into skill resolution as context.
 *
 * Both are fixed; these tests fail if either regresses.
 */

import test from "node:test";
import assert from "node:assert";
import { mock } from "node:test";

import VoiceProfile from "../src/models/voiceProfile.model.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import WorkerSkill from "../src/models/workerSkill.model.js";
import Skill from "../src/models/skill.model.js";
import JobCategory from "../src/models/jobCategory.model.js";
import { confirmAndApplyToProfile } from "../src/controllers/voiceProfile.controller.js";

const WORKER_A_USER = "507f1f77bcf86cd7994a0001";
const WORKER_A_PROFILE = "507f1f77bcf86cd7994a0002";
const WORKER_B_USER = "507f1f77bcf86cd7994a0003";
const WORKER_B_PROFILE = "507f1f77bcf86cd7994a0004";
const VP_A = "507f1f77bcf86cd7994a0005";
const VP_B = "507f1f77bcf86cd7994a0006";

function fakeReqRes({ user, body = {} } = {}) {
  const req = { user, body, params: {}, query: {} };
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

/** A stored profile with real, already-correct values that must not be lost. */
function storedProfile(overrides = {}) {
  return {
    _id: WORKER_A_PROFILE,
    userId: WORKER_A_USER,
    fullName: "Existing Name",
    city: "Kolhapur",
    expectedPay: 700,
    experienceYears: 5,
    availability: "available",
    languages: ["mr", "hi"],
    bio: { mr: "जुना बायो" },
    preferredJobCategories: [],
    save: async function () {
      return this;
    },
    ...overrides,
  };
}

/**
 * Mocks the two lookups the controller makes. VoiceProfile.findOne answers only
 * the filter it is given - including `workerId` - exactly as MongoDB would, so
 * the ownership check is genuinely exercised rather than stepped around.
 */
function mockScenario(t, { profile, voiceProfiles = {} } = {}) {
  const mocks = [
    mock.method(WorkerProfile, "findOne", async ({ userId }) => {
      if (String(userId) === WORKER_A_USER) return profile;
      if (String(userId) === WORKER_B_USER) return { ...storedProfile(), _id: WORKER_B_PROFILE, userId: WORKER_B_USER };
      return null;
    }),
    // Faithful to MongoDB: a filter WITHOUT workerId is an unscoped query and
    // returns the document by id alone - which is precisely what the original
    // unscoped findById did. Modelling it this way is what lets test F fail
    // against a permissive implementation instead of merely against a missing
    // mock key.
    mock.method(VoiceProfile, "findOne", async (filter) => {
      const doc = voiceProfiles[String(filter._id)];
      if (!doc) return null;
      if (filter.workerId === undefined) return doc;
      if (String(filter.workerId) !== String(doc.workerId)) return null;
      return doc;
    }),
    // Nothing in these tests should reach the catalog or create skills.
    mock.method(Skill, "find", async () => []),
    mock.method(JobCategory, "find", async () => []),
    mock.method(WorkerSkill, "findOneAndUpdate", async () => {
      throw new Error("no skill work expected in these tests");
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));
}

// `save` and `status` are present because the shared commit path now marks a
// session committed after the profile save succeeds - the same path both the
// quick and guided flows end on.
const voiceProfileDoc = (overrides) => ({
  status: "draft",
  save: async function () {
    return this;
  },
  ...overrides,
});

const OWNED_VP = voiceProfileDoc({
  _id: VP_A,
  workerId: WORKER_A_PROFILE,
  language: "mr",
  transcript: "worker A's own speech",
});
const OTHER_VP = voiceProfileDoc({
  _id: VP_B,
  workerId: WORKER_B_PROFILE,
  language: "hi",
  transcript: "worker B's private speech",
});

const confirm = async (user, body) => {
  const { req, res, next, done } = fakeReqRes({ user, body });
  confirmAndApplyToProfile(req, res, next);
  const { error } = await done;
  return { error, res };
};

// =============================================================================
// A. experience = 0
// =============================================================================

test("A: a confirmed experienceYears of 0 REPLACES an existing 5", async (t) => {
  const profile = storedProfile({ experienceYears: 5 });
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  const { error, res } = await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: VP_A,
    confirmedFields: { experienceYears: 0 },
  });

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(
    profile.experienceYears,
    0,
    "a fresher must be able to record no experience - truthiness dropped this and left 5"
  );
});

test("A: 0 is stored as the number 0, not coerced away", async (t) => {
  const profile = storedProfile({ experienceYears: 10 });
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  await confirm({ _id: WORKER_A_USER }, { voiceProfileId: VP_A, confirmedFields: { experienceYears: 0 } });

  assert.strictEqual(typeof profile.experienceYears, "number");
  assert.strictEqual(profile.experienceYears, 0);
});

// =============================================================================
// B. expectedPay = 0
// =============================================================================

test("B: a confirmed expectedPay of 0 REPLACES an existing 700", async (t) => {
  const profile = storedProfile({ expectedPay: 700 });
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  const { error } = await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: VP_A,
    confirmedFields: { expectedPay: 0 },
  });

  assert.strictEqual(error, null);
  assert.strictEqual(profile.expectedPay, 0);
});

test("B: zero pay and zero experience together both land", async (t) => {
  const profile = storedProfile({ expectedPay: 900, experienceYears: 3 });
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: VP_A,
    confirmedFields: { expectedPay: 0, experienceYears: 0 },
  });

  assert.strictEqual(profile.expectedPay, 0);
  assert.strictEqual(profile.experienceYears, 0);
});

// =============================================================================
// C / D. null and undefined must NOT overwrite a good existing value
// =============================================================================

for (const [label, missing] of [
  ["C: null", null],
  ["D: undefined", undefined],
]) {
  test(`${label} does not overwrite any existing value`, async (t) => {
    const profile = storedProfile();
    mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

    const { error } = await confirm({ _id: WORKER_A_USER }, {
      voiceProfileId: VP_A,
      confirmedFields: {
        fullName: missing,
        city: missing,
        expectedPay: missing,
        experienceYears: missing,
        availability: missing,
        languages: missing,
        bio: missing,
      },
    });

    assert.strictEqual(error, null);
    // This is the exact rule from the brief: a failed extraction must leave a
    // stored experience of 5 at 5.
    assert.strictEqual(profile.experienceYears, 5);
    assert.strictEqual(profile.expectedPay, 700);
    assert.strictEqual(profile.fullName, "Existing Name");
    assert.strictEqual(profile.city, "Kolhapur");
    assert.strictEqual(profile.availability, "available");
    assert.deepStrictEqual(profile.languages, ["mr", "hi"]);
    assert.deepStrictEqual(profile.bio, { mr: "जुना बायो" });
  });
}

test("C/D: an entirely absent confirmedFields changes nothing and does not crash", async (t) => {
  const profile = storedProfile();
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  const { error } = await confirm({ _id: WORKER_A_USER }, { voiceProfileId: VP_A });

  assert.strictEqual(error, null, "a missing confirmedFields must not be a 500");
  assert.strictEqual(profile.experienceYears, 5);
  assert.strictEqual(profile.expectedPay, 700);
});

test("C/D: blank text is a failed extraction, not an answer, and never overwrites", async (t) => {
  const profile = storedProfile();
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: VP_A,
    confirmedFields: { fullName: "   ", city: "", bio: "  ", availability: "" },
  });

  assert.strictEqual(profile.fullName, "Existing Name");
  assert.strictEqual(profile.city, "Kolhapur");
  assert.strictEqual(profile.availability, "available");
  assert.deepStrictEqual(profile.bio, { mr: "जुना बायो" });
});

test("C/D: an empty languages array does not clear a stored list", async (t) => {
  const profile = storedProfile();
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  await confirm({ _id: WORKER_A_USER }, { voiceProfileId: VP_A, confirmedFields: { languages: [] } });

  assert.deepStrictEqual(profile.languages, ["mr", "hi"], "an empty extraction must not wipe languages");
});

test("real values still apply normally - the fix did not stop writes", async (t) => {
  const profile = storedProfile();
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: VP_A,
    confirmedFields: {
      fullName: "New Name",
      city: "Pune",
      expectedPay: 850,
      experienceYears: 7,
      availability: "busy",
      languages: ["en"],
      bio: "नवीन बायो",
    },
  });

  assert.strictEqual(profile.fullName, "New Name");
  assert.strictEqual(profile.city, "Pune");
  assert.strictEqual(profile.expectedPay, 850);
  assert.strictEqual(profile.experienceYears, 7);
  assert.strictEqual(profile.availability, "busy");
  assert.deepStrictEqual(profile.languages, ["en"]);
  assert.strictEqual(profile.bio.mr, "नवीन बायो");
});

// =============================================================================
// E / F / G / H. ownership of the VoiceProfile
// =============================================================================

test("E: a worker confirming their OWN voice profile succeeds", async (t) => {
  const profile = storedProfile();
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP, [VP_B]: OTHER_VP } });

  const { error, res } = await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: VP_A,
    confirmedFields: { fullName: "Confirmed By Owner" },
  });

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(profile.fullName, "Confirmed By Owner");
});

test("F: a worker submitting ANOTHER worker's voiceProfileId is rejected", async (t) => {
  const profile = storedProfile();
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP, [VP_B]: OTHER_VP } });

  const { error } = await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: VP_B,
    confirmedFields: { fullName: "Should Not Apply" },
  });

  assert.ok(error, "another worker's voice profile must not be usable");
  assert.strictEqual(
    error.statusCode,
    404,
    "404, not 403 - whether someone else's voice profile exists is not this caller's business"
  );
  // And nothing was written to the attacker's own profile either.
  assert.strictEqual(profile.fullName, "Existing Name");
});

test("F: the other worker's transcript is never reached", async (t) => {
  const profile = storedProfile();
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP, [VP_B]: OTHER_VP } });
  // If the controller reached B's document, its transcript would be handed to
  // skill resolution as context - so any call here is a leak.
  const skillFindMock = mock.method(Skill, "find", async () => {
    throw new Error("skill resolution must not run on another worker's transcript");
  });
  t.after(() => skillFindMock.mock.restore());

  const { error, res } = await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: VP_B,
    confirmedFields: { skills: ["electrician"] },
  });

  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(res.body, null, "no part of the other worker's data may be returned");
});

test("F: ownership is a FILTER, so the lookup itself is scoped to the caller", async (t) => {
  const profile = storedProfile();
  let capturedFilter = null;
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => profile),
    mock.method(VoiceProfile, "findOne", async (filter) => {
      capturedFilter = filter;
      return null;
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  await confirm({ _id: WORKER_A_USER }, { voiceProfileId: VP_A, confirmedFields: {} });

  assert.strictEqual(String(capturedFilter._id), VP_A);
  assert.strictEqual(
    String(capturedFilter.workerId),
    WORKER_A_PROFILE,
    "workerId must be part of the query, not compared afterwards"
  );
});

test("G: a malformed voiceProfileId is a 4xx, never a 500", async (t) => {
  const profile = storedProfile();
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => profile),
    // A real Mongoose query throws a CastError for an unusable id; the global
    // handler classifies that as a 400 ("Malformed ID format").
    mock.method(VoiceProfile, "findOne", async () => {
      throw Object.assign(new Error('Cast to ObjectId failed for value "@@@"'), { name: "CastError" });
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { error } = await confirm({ _id: WORKER_A_USER }, { voiceProfileId: "@@@", confirmedFields: {} });

  assert.ok(error);
  assert.strictEqual(error.name, "CastError", "must surface as a CastError for the 400 mapping, not a crash");
  assert.strictEqual(profile.fullName, "Existing Name");
});

test("H: a nonexistent voiceProfileId is a 404 and writes nothing", async (t) => {
  const profile = storedProfile();
  mockScenario(t, { profile, voiceProfiles: { [VP_A]: OWNED_VP } });

  const { error } = await confirm({ _id: WORKER_A_USER }, {
    voiceProfileId: "507f1f77bcf86cd7994a00ff",
    confirmedFields: { experienceYears: 0 },
  });

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
  assert.strictEqual(profile.experienceYears, 5, "nothing may be written for an unknown voice profile");
});

test("a worker with no WorkerProfile cannot confirm anything", async (t) => {
  const mocks = [
    mock.method(WorkerProfile, "findOne", async () => null),
    mock.method(VoiceProfile, "findOne", async () => {
      throw new Error("the voice profile must not even be looked up without a worker profile");
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { error } = await confirm({ _id: "507f1f77bcf86cd7994a00fe" }, { voiceProfileId: VP_A, confirmedFields: {} });

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
});
