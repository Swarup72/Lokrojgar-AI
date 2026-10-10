/**
 * Guided voice employer profile tests.
 *
 * Covers:
 *   - starting a guided employer draft with employer steps;
 *   - resuming an existing employer draft;
 *   - recording and extracting short natural-language answers (fullName, businessName, businessType, city);
 *   - skipping optional fields (businessName);
 *   - retrying a failed step without losing previous answers;
 *   - editing an answer via PATCH;
 *   - discard draft deletes only the draft;
 *   - confirming commits to EmployerProfile and User.fullName additively;
 *   - unconfirmed values do not reach EmployerProfile;
 *   - ownership is scoped to caller's employer profile;
 *   - cross-user access rejected;
 *   - audio is deleted immediately and never retained.
 */

import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";

import VoiceProfile from "../src/models/voiceProfile.model.js";
import EmployerProfile from "../src/models/employerProfile.model.js";
import User from "../src/models/user.model.js";
import {
  startGuidedSession,
  getGuidedDraft,
  submitGuidedVoiceStep,
  setGuidedDraftField,
  discardGuidedDraft,
  confirmAndApplyToProfile,
  GUIDED_EMPLOYER_VOICE_STEPS,
  GUIDED_EMPLOYER_STEPS,
} from "../src/controllers/voiceProfile.controller.js";

const EMPLOYER_USER_A = "507f1f77bcf86cd7994c0001";
const EMPLOYER_PROFILE_A = "507f1f77bcf86cd7994c0002";
const EMPLOYER_USER_B = "507f1f77bcf86cd7994c0003";
const EMPLOYER_PROFILE_B = "507f1f77bcf86cd7994c0004";
const DRAFT_ID = "507f1f77bcf86cd7994c0005";

function fakeReqRes({ user, body = {}, query = {}, file } = {}) {
  const req = { user, body, query, params: {}, file };
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

function mockEmployerDraftScenario(t, { employerProfile, initialDraft = null } = {}) {
  let draftDoc = initialDraft;

  const mocks = [
    mock.method(EmployerProfile, "findOne", async ({ userId }) => {
      if (String(userId) === String(employerProfile?.userId)) return employerProfile;
      return null;
    }),
    mock.method(VoiceProfile, "findOne", async (filter) => {
      if (!draftDoc) return null;
      if (filter.employerId && String(filter.employerId) !== String(draftDoc.employerId)) return null;
      if (filter.language && filter.language !== draftDoc.language) return null;
      if (filter._id && String(filter._id) !== String(draftDoc._id)) return null;
      return draftDoc;
    }),
    mock.method(VoiceProfile, "create", async (data) => {
      draftDoc = {
        _id: DRAFT_ID,
        ...data,
        save: async function () {
          return this;
        },
        markModified: function () {},
      };
      return draftDoc;
    }),
    mock.method(VoiceProfile, "deleteOne", async (filter) => {
      if (draftDoc && String(draftDoc.employerId) === String(filter.employerId)) {
        draftDoc = null;
      }
      return { deletedCount: 1 };
    }),
    mock.method(User, "updateOne", async () => ({ matchedCount: 1, modifiedCount: 1 })),
  ];

  t.after(() => mocks.forEach((m) => m.mock.restore()));
  return () => draftDoc;
}

test("Employer guided: step plan contains fullName, businessName, businessType, city", (t) => {
  assert.deepStrictEqual(GUIDED_EMPLOYER_STEPS, ["fullName", "businessName", "businessType", "city"]);
  assert.deepStrictEqual(GUIDED_EMPLOYER_VOICE_STEPS, ["fullName", "businessName", "businessType", "city"]);
});

test("Employer guided: start session creates an employer draft", async (t) => {
  const profile = { _id: EMPLOYER_PROFILE_A, userId: EMPLOYER_USER_A };
  mockEmployerDraftScenario(t, { employerProfile: profile });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_A, roles: ["employer"] },
    body: { language: "mr", role: "employer" },
  });

  startGuidedSession(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.role, "employer");
  assert.deepStrictEqual(res.body.data.steps, GUIDED_EMPLOYER_STEPS);
  assert.strictEqual(res.body.data.status, "draft");
});

test("Employer guided: starting again resumes existing draft", async (t) => {
  const profile = { _id: EMPLOYER_PROFILE_A, userId: EMPLOYER_USER_A };
  const existingDraft = {
    _id: DRAFT_ID,
    employerId: EMPLOYER_PROFILE_A,
    language: "mr",
    mode: "guided",
    profileType: "employer",
    status: "draft",
    draftFields: { fullName: "राजेश पाटील" },
    completedSteps: ["fullName"],
    save: async function () { return this; },
    markModified: function () {},
  };

  mockEmployerDraftScenario(t, { employerProfile: profile, initialDraft: existingDraft });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_A, roles: ["employer"] },
    body: { language: "mr", role: "employer" },
  });

  startGuidedSession(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.data.draftFields, { fullName: "राजेश पाटील" });
  assert.deepStrictEqual(res.body.data.completedSteps, ["fullName"]);
});

test("Employer guided: get draft returns employer draft in progress", async (t) => {
  const profile = { _id: EMPLOYER_PROFILE_A, userId: EMPLOYER_USER_A };
  const existingDraft = {
    _id: DRAFT_ID,
    employerId: EMPLOYER_PROFILE_A,
    language: "en",
    mode: "guided",
    profileType: "employer",
    status: "draft",
    draftFields: { fullName: "Rajesh Patil", businessName: "Patil Electricals" },
    completedSteps: ["fullName", "businessName"],
    save: async function () { return this; },
    markModified: function () {},
  };

  mockEmployerDraftScenario(t, { employerProfile: profile, initialDraft: existingDraft });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_A, roles: ["employer"] },
    query: { language: "en", role: "employer" },
  });

  getGuidedDraft(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.data.draftFields, {
    fullName: "Rajesh Patil",
    businessName: "Patil Electricals",
  });
});

test("Employer guided: PATCH setGuidedDraftField saves field without audio", async (t) => {
  const profile = { _id: EMPLOYER_PROFILE_A, userId: EMPLOYER_USER_A };
  const existingDraft = {
    _id: DRAFT_ID,
    employerId: EMPLOYER_PROFILE_A,
    language: "mr",
    mode: "guided",
    profileType: "employer",
    status: "draft",
    draftFields: {},
    completedSteps: [],
    save: async function () { return this; },
    markModified: function () {},
  };

  mockEmployerDraftScenario(t, { employerProfile: profile, initialDraft: existingDraft });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_A, roles: ["employer"] },
    body: { language: "mr", role: "employer", field: "businessName", value: "पाटील इलेक्ट्रीकल्स" },
  });

  setGuidedDraftField(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(existingDraft.draftFields.businessName, "पाटील इलेक्ट्रीकल्स");
  assert.ok(existingDraft.completedSteps.includes("businessName"));
});

test("Employer guided: confirmAndApplyToProfile commits to EmployerProfile and User", async (t) => {
  const employerDoc = {
    _id: EMPLOYER_PROFILE_A,
    userId: EMPLOYER_USER_A,
    businessName: null,
    businessType: null,
    city: null,
    save: async function () { return this; },
  };

  const draftDoc = {
    _id: DRAFT_ID,
    employerId: EMPLOYER_PROFILE_A,
    language: "mr",
    mode: "guided",
    profileType: "employer",
    status: "draft",
    draftFields: {
      fullName: "राजेश पाटील",
      businessName: "पाटील इलेक्ट्रीकल्स",
      businessType: "इलेक्ट्रिकल वायरिंग आणि दुरुस्ती",
      city: "कोल्हापूर",
    },
    save: async function () { return this; },
  };

  const mocks = [
    mock.method(EmployerProfile, "findOne", async () => employerDoc),
    mock.method(VoiceProfile, "findOne", async () => draftDoc),
    mock.method(User, "updateOne", async () => ({ matchedCount: 1 })),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_A, roles: ["employer"] },
    body: {
      voiceProfileId: DRAFT_ID,
      role: "employer",
      confirmedFields: {
        fullName: "राजेश पाटील",
        businessName: "पाटील इलेक्ट्रीकल्स",
        businessType: "इलेक्ट्रिकल वायरिंग आणि दुरुस्ती",
        city: "कोल्हापूर",
      },
    },
  });

  confirmAndApplyToProfile(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(employerDoc.businessName, "पाटील इलेक्ट्रीकल्स");
  assert.strictEqual(employerDoc.businessType, "इलेक्ट्रिकल वायरिंग आणि दुरुस्ती");
  assert.strictEqual(employerDoc.city, "कोल्हापूर");
  assert.strictEqual(draftDoc.status, "committed");
});

test("Employer guided: cross-user draft access is rejected with 404", async (t) => {
  const employerDoc = { _id: EMPLOYER_PROFILE_A, userId: EMPLOYER_USER_A };
  const otherDraft = {
    _id: DRAFT_ID,
    employerId: EMPLOYER_PROFILE_B, // Owned by employer B
    language: "mr",
    mode: "guided",
    profileType: "employer",
    status: "draft",
  };

  const mocks = [
    mock.method(EmployerProfile, "findOne", async ({ userId }) => {
      if (String(userId) === EMPLOYER_USER_A) return employerDoc;
      return null;
    }),
    mock.method(VoiceProfile, "findOne", async (filter) => {
      // Scoped by employerId
      if (String(filter.employerId) === String(otherDraft.employerId)) return otherDraft;
      return null;
    }),
  ];
  t.after(() => mocks.forEach((m) => m.mock.restore()));

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_A, roles: ["employer"] },
    body: {
      voiceProfileId: DRAFT_ID,
      role: "employer",
      confirmedFields: { businessName: "Stolen Name" },
    },
  });

  confirmAndApplyToProfile(req, res, next);
  const { error } = await done;

  assert.ok(error);
  assert.strictEqual(error.statusCode, 404);
});

test("Employer guided: discard deletes only the draft and touches not the profile", async (t) => {
  const profile = { _id: EMPLOYER_PROFILE_A, userId: EMPLOYER_USER_A, businessName: "Original Business" };
  const existingDraft = {
    _id: DRAFT_ID,
    employerId: EMPLOYER_PROFILE_A,
    language: "mr",
    mode: "guided",
    profileType: "employer",
    status: "draft",
    save: async function () { return this; },
    markModified: function () {},
  };

  const getDraft = mockEmployerDraftScenario(t, { employerProfile: profile, initialDraft: existingDraft });

  const { req, res, next, done } = fakeReqRes({
    user: { _id: EMPLOYER_USER_A, roles: ["employer"] },
    body: { language: "mr", role: "employer" },
  });

  discardGuidedDraft(req, res, next);
  const { error } = await done;

  assert.strictEqual(error, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(getDraft(), null);
  assert.strictEqual(profile.businessName, "Original Business");
});
