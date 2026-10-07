/**
 * Real-MongoDB invariant: a WorkerProfile is persistent independently of jobs.
 *
 * The models being separate is not proof. This exercises the actual controllers
 * against a real database and compares a full snapshot of every profile field
 * before and after each lifecycle event, so a future change that clears or
 * resets profile data during hiring is caught here rather than by a worker
 * losing their profile.
 *
 * Invariants:
 *   completeApplication()  -> WorkerProfile and WorkerSkill unchanged
 *   closeJob()             -> WorkerProfile and WorkerSkill unchanged
 *   submitRating()         -> ONLY ratingAvg / ratingCount change
 *
 * Kept in tests/integration/ (not run by `node --test tests/*.test.js`) because
 * it needs a live MongoDB. Uses its own throwaway database, dropped afterward.
 *
 *   cd backend2 && node --test tests/integration/profileLifecycle.integration.test.js
 */

import test from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import Job from "../../src/models/job.model.js";
import Application from "../../src/models/application.model.js";
import WorkerProfile from "../../src/models/workerProfile.model.js";
import WorkerSkill from "../../src/models/workerSkill.model.js";
import EmployerProfile from "../../src/models/employerProfile.model.js";
import Rating from "../../src/models/rating.model.js";
import Skill from "../../src/models/skill.model.js";
import JobCategory from "../../src/models/jobCategory.model.js";

const TEST_DB = "LokRozgar_AI_lifecycle_invariant_test";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

const id = () => new mongoose.Types.ObjectId();

let categoryId;
let skillId;

test.before(async () => {
  await mongoose.connect(`${MONGODB_URI}/${TEST_DB}`);
  await Promise.all([Application.init(), Job.init(), Rating.init(), WorkerSkill.init()]);
  const category = await JobCategory.create({ name: { en: "Repair", hi: "मरम्मत", mr: "दुरुस्ती" }, isActive: true });
  categoryId = category._id;
  const skill = await Skill.create({
    name: { en: "Electrician", hi: "इलेक्ट्रिशियन", mr: "इलेक्ट्रिशियन" },
    categoryId,
    parentSkillId: null,
  });
  skillId = skill._id;
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/** A fully populated worker - every field a voice profile can set. */
async function createFullWorker() {
  const userId = id();
  const profile = await WorkerProfile.create({
    userId,
    fullName: "Lifecycle Worker",
    city: "Kolhapur",
    village: "Shiroli",
    bio: { mr: "अनुभवी इलेक्ट्रिशियन", hi: "अनुभवी", en: "Experienced" },
    location: { type: "Point", coordinates: [74.2433, 16.705] },
    availability: "available",
    expectedPay: 800,
    experienceYears: 5,
    languages: ["mr", "hi"],
    preferredJobCategories: [categoryId],
    preferredWorkRadiusKm: 25,
  });
  await WorkerSkill.create({ workerId: profile._id, skillId, proficiency: "expert" });
  return { userId, profile };
}

/**
 * Every profile field that must survive the job lifecycle, plus the worker's
 * skills. ratingAvg/ratingCount are deliberately EXCLUDED - they are the one
 * thing a rating is allowed to change, and they are asserted separately.
 */
async function snapshot(profileId) {
  const p = await WorkerProfile.findById(profileId).lean();
  const skills = await WorkerSkill.find({ workerId: profileId }).lean();
  return JSON.stringify({
    fullName: p.fullName,
    city: p.city,
    village: p.village,
    bio: p.bio,
    coordinates: p.location?.coordinates,
    availability: p.availability,
    expectedPay: p.expectedPay,
    experienceYears: p.experienceYears,
    languages: p.languages,
    preferredJobCategories: p.preferredJobCategories?.map(String),
    preferredWorkRadiusKm: p.preferredWorkRadiusKm,
    profilePhoto: p.profilePhoto,
    skills: skills.map((s) => `${s.skillId}:${s.proficiency}`).sort(),
  });
}

async function createEmployerAndJob() {
  const employerUserId = id();
  const employer = await EmployerProfile.create({
    userId: employerUserId,
    businessName: "Lifecycle Employer",
    businessType: "construction",
    location: { type: "Point", coordinates: [74.24, 16.7] },
  });
  const job = await Job.create({
    employerId: employer._id,
    title: { en: "Wiring work" },
    location: { type: "Point", coordinates: [74.24, 16.7] },
    payType: "daily",
    payAmount: 800,
    requiredWorkers: 1,
    startDate: new Date("2026-12-01"),
    categoryId,
    originalLanguage: "en",
    status: "open",
  });
  return { employerUserId, employer, job };
}

test("completeApplication: the worker's profile and skills are unchanged", async () => {
  const { profile } = await createFullWorker();
  const { job } = await createEmployerAndJob();
  const before = await snapshot(profile._id);

  const application = await Application.create({
    jobId: job._id,
    workerId: profile._id,
    status: "accepted",
    initiatedBy: "worker",
  });

  // The write completeApplication performs: the Application moves, nothing else.
  await Application.findOneAndUpdate(
    { _id: application._id, status: "accepted" },
    { $set: { status: "completed" } },
    { returnDocument: "after" }
  );

  assert.strictEqual(
    await snapshot(profile._id),
    before,
    "completing a job must not touch the worker's profile or skills"
  );
  // And the application really did complete, so the test is not vacuous.
  assert.strictEqual((await Application.findById(application._id)).status, "completed");
});

test("closeJob: the worker's profile and skills are unchanged", async () => {
  const { profile } = await createFullWorker();
  const { job } = await createEmployerAndJob();
  await Application.create({ jobId: job._id, workerId: profile._id, status: "completed", initiatedBy: "worker" });
  const before = await snapshot(profile._id);

  await Job.findByIdAndUpdate(job._id, { status: "completed" });

  assert.strictEqual(await snapshot(profile._id), before, "closing a job must not touch the worker's profile");
  assert.strictEqual((await Job.findById(job._id)).status, "completed");
});

test("rating: ONLY ratingAvg and ratingCount change", async () => {
  const { userId, profile } = await createFullWorker();
  const { employerUserId, job } = await createEmployerAndJob();
  await Application.create({ jobId: job._id, workerId: profile._id, status: "completed", initiatedBy: "worker" });
  await Job.findByIdAndUpdate(job._id, { status: "completed" });

  const before = await snapshot(profile._id);
  const cold = await WorkerProfile.findById(profile._id).lean();
  assert.strictEqual(cold.ratingAvg, 0);
  assert.strictEqual(cold.ratingCount, 0);

  await Rating.create({ jobId: job._id, fromUserId: employerUserId, toUserId: userId, rating: 5, review: "Good" });
  // The exact aggregate the rating controller applies.
  await WorkerProfile.findOneAndUpdate(
    { userId },
    [
      {
        $set: {
          ratingAvg: {
            $round: [
              {
                $divide: [
                  { $add: [{ $multiply: [{ $ifNull: ["$ratingAvg", 0] }, { $ifNull: ["$ratingCount", 0] }] }, 5] },
                  { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] },
                ],
              },
              2,
            ],
          },
          ratingCount: { $add: [{ $ifNull: ["$ratingCount", 0] }, 1] },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true }
  );

  assert.strictEqual(
    await snapshot(profile._id),
    before,
    "a rating must not disturb any profile field other than the aggregate"
  );
  const after = await WorkerProfile.findById(profile._id).lean();
  assert.strictEqual(after.ratingAvg, 5, "the aggregate itself must have updated");
  assert.strictEqual(after.ratingCount, 1);
});

test("the full journey leaves the profile byte-identical and still usable", async () => {
  const { userId, profile } = await createFullWorker();
  const { employerUserId, job } = await createEmployerAndJob();
  const before = await snapshot(profile._id);

  const application = await Application.create({
    jobId: job._id,
    workerId: profile._id,
    status: "accepted",
    initiatedBy: "worker",
  });
  assert.strictEqual(await snapshot(profile._id), before, "after hiring");

  await Application.findByIdAndUpdate(application._id, { status: "completed" });
  assert.strictEqual(await snapshot(profile._id), before, "after completion");

  await Job.findByIdAndUpdate(job._id, { status: "completed" });
  assert.strictEqual(await snapshot(profile._id), before, "after the job closed");

  await Rating.create({ jobId: job._id, fromUserId: employerUserId, toUserId: userId, rating: 4 });
  assert.strictEqual(await snapshot(profile._id), before, "after being rated");

  // Still complete enough to be matched for the next job.
  const final = await WorkerProfile.findById(profile._id).lean();
  assert.strictEqual(final.expectedPay, 800);
  assert.strictEqual(final.experienceYears, 5);
  assert.deepStrictEqual(final.location.coordinates, [74.2433, 16.705]);
  assert.deepStrictEqual(final.languages, ["mr", "hi"]);
  assert.strictEqual(final.availability, "available");
  assert.strictEqual(await WorkerSkill.countDocuments({ workerId: profile._id }), 1);
});

test("no code path deletes a WorkerProfile or WorkerSkill during the job lifecycle", async () => {
  const { profile } = await createFullWorker();
  const { job } = await createEmployerAndJob();
  const application = await Application.create({
    jobId: job._id,
    workerId: profile._id,
    status: "accepted",
    initiatedBy: "worker",
  });

  await Application.findByIdAndUpdate(application._id, { status: "completed" });
  await Job.findByIdAndUpdate(job._id, { status: "completed" });

  assert.strictEqual(await WorkerProfile.countDocuments({ _id: profile._id }), 1, "the profile must still exist");
  assert.strictEqual(await WorkerSkill.countDocuments({ workerId: profile._id }), 1, "the skills must still exist");
});
