/**
 * Real-MongoDB test: the guided voice JOB draft.
 *
 * Three things only a real database can show:
 *
 *   1. The uniqueness rule. One OPEN draft per employer per spoken language,
 *      but a consumed one must not occupy the slot forever — otherwise an
 *      employer could post one Marathi job and never another.
 *   2. That a job draft and the employer's own guided PROFILE draft coexist.
 *      This is the reason VoiceJobDraft exists at all: VoiceProfile's unique
 *      index is { employerId, language, mode }, which the employer profile
 *      wizard already occupies, so a job draft stored there would collide.
 *   3. That a draft is invisible to everything that lists jobs — it is not in
 *      the Job collection, so no query, search or recommendation can reach it.
 *
 *   cd backend2 && node --test tests/integration/voiceJobDraft.integration.test.js
 */

import test from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import VoiceJobDraft from "../../src/models/voiceJobDraft.model.js";
import VoiceProfile from "../../src/models/voiceProfile.model.js";
import Job from "../../src/models/job.model.js";

const TEST_DB = "LokRozgar_AI_voice_job_draft_test";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

const id = () => new mongoose.Types.ObjectId();

test.before(async () => {
  await mongoose.connect(`${MONGODB_URI}/${TEST_DB}`);
  // Indexes build in the background; asserting an index-backed guarantee
  // without waiting races the build.
  await VoiceJobDraft.init();
  await VoiceProfile.init();
  await Job.init();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("one employer holds only one OPEN draft per spoken language", async () => {
  const employerId = id();
  await VoiceJobDraft.create({ employerId, language: "mr", draftFields: { jobTitle: "वायरिंग" } });

  await assert.rejects(
    () => VoiceJobDraft.create({ employerId, language: "mr" }),
    (error) => error?.code === 11000,
    "a second open Marathi draft should violate the unique index"
  );
});

test("the same employer may hold open drafts in different languages", async () => {
  const employerId = id();
  await VoiceJobDraft.create({ employerId, language: "mr" });
  await VoiceJobDraft.create({ employerId, language: "hi" });
  await VoiceJobDraft.create({ employerId, language: "en" });

  assert.strictEqual(await VoiceJobDraft.countDocuments({ employerId, status: "draft" }), 3);
});

test("a consumed draft frees the slot for the next advert", async () => {
  const employerId = id();
  const first = await VoiceJobDraft.create({ employerId, language: "mr" });

  first.status = "consumed";
  first.consumedAt = new Date();
  await first.save();

  // Without the partial filter on status, this would fail and the employer
  // could never post a second Marathi job by voice.
  const second = await VoiceJobDraft.create({ employerId, language: "mr" });
  assert.notStrictEqual(String(first._id), String(second._id));
  assert.strictEqual(await VoiceJobDraft.countDocuments({ employerId, language: "mr" }), 2);
});

test("two employers each hold their own Marathi draft", async () => {
  const a = id();
  const b = id();
  await VoiceJobDraft.create({ employerId: a, language: "mr", draftFields: { jobTitle: "A's job" } });
  await VoiceJobDraft.create({ employerId: b, language: "mr", draftFields: { jobTitle: "B's job" } });

  const aDraft = await VoiceJobDraft.findOne({ employerId: a, language: "mr", status: "draft" });
  assert.strictEqual(aDraft.draftFields.jobTitle, "A's job");
  // The filter the controller uses cannot reach the other employer's row.
  assert.strictEqual(await VoiceJobDraft.countDocuments({ employerId: a }), 1);
});

test("a job draft and the employer's guided PROFILE draft coexist", async () => {
  const employerId = id();

  // The employer profile wizard's document — the slot VoiceJobDraft avoids.
  await VoiceProfile.create({
    employerId,
    profileType: "employer",
    language: "mr",
    mode: "guided",
    status: "draft",
    draftFields: { businessName: "पाल कंस्ट्रक्शन" },
  });

  // The job wizard's document, same employer, same language. This is exactly
  // the combination that would have been an E11000 inside VoiceProfile.
  const jobDraft = await VoiceJobDraft.create({
    employerId,
    language: "mr",
    draftFields: { jobTitle: "इलेक्ट्रिशियन" },
  });

  assert.ok(jobDraft._id);
  assert.strictEqual(await VoiceProfile.countDocuments({ employerId, language: "mr" }), 1);
  assert.strictEqual(await VoiceJobDraft.countDocuments({ employerId, language: "mr" }), 1);
});

test("a draft is not a job and cannot be found by any job query", async () => {
  const employerId = id();
  await VoiceJobDraft.create({
    employerId,
    language: "mr",
    draftFields: {
      jobTitle: "गुप्त इलेक्ट्रिशियन",
      jobPayAmount: 800,
      jobPayType: "daily",
      jobCity: "कोल्हापूर",
    },
    completedSteps: ["jobTitle", "jobPayAmount", "jobPayType", "jobCity"],
  });

  // Everything that surfaces work to a worker reads the Job collection.
  assert.strictEqual(await Job.countDocuments({}), 0);
  assert.strictEqual(await Job.countDocuments({ status: "open" }), 0);
  assert.strictEqual(await Job.countDocuments({ employerId }), 0);

  const searchable = await Job.find({ "title.mr": /इलेक्ट्रिशियन/ });
  assert.deepEqual(searchable, []);
});

test("draft fields are stored verbatim and are not coerced into a job shape", async () => {
  const employerId = id();
  // Deliberately incomplete and partly unusable — a half-spoken advert. The
  // draft must accept it; the Job schema is what refuses it later.
  const draft = await VoiceJobDraft.create({
    employerId,
    language: "hi",
    draftFields: { jobTitle: "इलेक्ट्रीशियन", jobWorkerCount: 2, jobPayAmount: null },
    completedSteps: ["jobTitle", "jobWorkerCount"],
  });

  const reread = await VoiceJobDraft.findById(draft._id);
  assert.strictEqual(reread.draftFields.jobTitle, "इलेक्ट्रीशियन");
  assert.strictEqual(reread.draftFields.jobWorkerCount, 2);
  assert.strictEqual(reread.draftFields.jobPayAmount, null);
  assert.deepEqual(reread.completedSteps, ["jobTitle", "jobWorkerCount"]);
  assert.strictEqual(reread.status, "draft");
});

test("a draft carries no audio and no stored recording reference", async () => {
  const employerId = id();
  const draft = await VoiceJobDraft.create({
    employerId,
    language: "mr",
    draftFields: { jobTitle: "इलेक्ट्रिशियन" },
  });

  const raw = await mongoose.connection.db
    .collection("voicejobdrafts")
    .findOne({ _id: draft._id });

  // Checked as FIELD NAMES and as audio-bearing VALUES, not as substrings of
  // the serialised document. The first version of this test scanned
  // JSON.stringify(doc) for "b2", which appears by chance inside a random
  // ObjectId hex string - measured at 0.8% of documents, e.g. an _id ending
  // "...20b2" - so it failed roughly one run in 120 for no real reason.
  const keys = [];
  const strings = [];
  (function walk(node) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node instanceof Date || node?._bsontype) return;
    if (typeof node === "string") return void strings.push(node);
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        keys.push(k);
        walk(v);
      }
    }
  })(raw);

  const audioKey = keys.find((k) => /audio|recording|clip/i.test(k));
  assert.strictEqual(audioKey, undefined, `draft stores an audio field: ${audioKey}`);

  const storedRef = strings.find((v) =>
    /cloudinary|backblaze|\bb2\.[a-z]|s3[.-]|^https?:\/\/|\.(mp3|wav|ogg|m4a|webm|aiff)\b/i.test(v)
  );
  assert.strictEqual(storedRef, undefined, `draft holds a stored-object reference: ${storedRef}`);
});

test("the incomplete draft cannot be saved as a Job without the real fields", async () => {
  // The guarantee that a voice draft cannot bypass job validation: feeding a
  // draft's fields straight into Job rejects, because Job still requires
  // category, coordinates, payType, startDate and originalLanguage.
  const employerId = id();
  await assert.rejects(
    () =>
      Job.create({
        employerId,
        title: { mr: "इलेक्ट्रिशियन" },
        payAmount: 800,
        requiredWorkers: 2,
      }),
    (error) => error?.name === "ValidationError",
    "an incomplete draft must not be publishable as a Job"
  );
});
