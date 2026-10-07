/**
 * Real-MongoDB test: the guided draft, and old VoiceProfile documents.
 *
 * Only a real database can show that the new unique index
 * { workerId, language, mode } lets a quick extraction and a guided draft coexist
 * for the same worker and language - which the previous { workerId, language }
 * index silently prevented, by letting one overwrite the other.
 *
 * It also proves documents written BEFORE `mode` existed are still readable and
 * still behave as quick-flow documents.
 *
 *   cd backend2 && node --test tests/integration/guidedDraft.integration.test.js
 */

import test from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import VoiceProfile from "../../src/models/voiceProfile.model.js";

const TEST_DB = "LokRozgar_AI_guided_draft_test";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

const id = () => new mongoose.Types.ObjectId();

test.before(async () => {
  await mongoose.connect(`${MONGODB_URI}/${TEST_DB}`);
  // Indexes build in the background; a test that asserts an index-backed
  // guarantee has to wait for it or it races the build.
  await VoiceProfile.init();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("a quick extraction and a guided draft coexist for one worker and language", async () => {
  const workerId = id();

  const quick = await VoiceProfile.create({
    workerId,
    language: "mr",
    mode: "quick",
    transcript: "everything at once",
    extractedFields: { fullName: "स्वरूप पाल" },
  });
  const guided = await VoiceProfile.create({
    workerId,
    language: "mr",
    mode: "guided",
    status: "draft",
    draftFields: { expectedPay: 800 },
    completedSteps: ["expectedPay"],
  });

  assert.notStrictEqual(String(quick._id), String(guided._id));
  // The old index would have made this impossible - one would have replaced
  // the other, losing whichever the worker was not looking at.
  assert.strictEqual(await VoiceProfile.countDocuments({ workerId, language: "mr" }), 2);
  const reread = await VoiceProfile.findById(quick._id);
  assert.strictEqual(reread.transcript, "everything at once", "the quick document is untouched");
});

test("a second draft for the same worker, language and mode is rejected by the index", async () => {
  const workerId = id();
  await VoiceProfile.create({ workerId, language: "hi", mode: "guided", status: "draft" });

  // Concurrent "start session" requests both miss the findOne; the index decides.
  const outcomes = await Promise.allSettled(
    [1, 2, 3].map(() => VoiceProfile.create({ workerId, language: "hi", mode: "guided", status: "draft" }))
  );

  assert.strictEqual(outcomes.filter((o) => o.status === "fulfilled").length, 0);
  for (const outcome of outcomes) {
    assert.strictEqual(outcome.reason.code, 11000, "must be a duplicate-key error");
  }
  assert.strictEqual(await VoiceProfile.countDocuments({ workerId, language: "hi", mode: "guided" }), 1);
});

test("drafts are separate per spoken language", async () => {
  const workerId = id();
  await VoiceProfile.create({ workerId, language: "mr", mode: "guided", status: "draft", draftFields: { city: "कोल्हापूर" } });
  await VoiceProfile.create({ workerId, language: "en", mode: "guided", status: "draft", draftFields: { city: "Mumbai" } });

  const marathi = await VoiceProfile.findOne({ workerId, language: "mr", mode: "guided" });
  const english = await VoiceProfile.findOne({ workerId, language: "en", mode: "guided" });
  assert.strictEqual(marathi.draftFields.city, "कोल्हापूर");
  assert.strictEqual(english.draftFields.city, "Mumbai");
});

test("a document written BEFORE `mode` existed is still readable and reads as quick", async () => {
  const workerId = id();
  // Exactly the old shape, inserted through the raw driver so no schema default
  // is applied - this is what the 12 documents in the dev database looked like.
  await VoiceProfile.collection.insertOne({
    workerId,
    language: "mr",
    transcript: "legacy transcript",
    extractedFields: { fullName: "Legacy Worker" },
    confidence: 0.8,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const legacy = await VoiceProfile.findOne({ workerId, language: "mr" });
  assert.ok(legacy, "an old document must still be found");
  assert.strictEqual(legacy.transcript, "legacy transcript");
  assert.strictEqual(legacy.extractedFields.fullName, "Legacy Worker");
  // The schema default applies on read for a field the document lacks.
  assert.strictEqual(legacy.mode, "quick");
  assert.strictEqual(legacy.status, "committed");
  assert.deepStrictEqual(legacy.draftFields, {});
  assert.deepStrictEqual([...legacy.completedSteps], []);
});

test("draft fields accumulate independently, and a zero survives a save cycle", async () => {
  const workerId = id();
  const draft = await VoiceProfile.create({ workerId, language: "mr", mode: "guided", status: "draft" });

  for (const [field, value] of [
    ["fullName", "स्वरूप पाल"],
    ["expectedPay", 0],
    ["experienceYears", 0],
    ["city", "कोल्हापूर"],
  ]) {
    draft.draftFields = { ...draft.draftFields, [field]: value };
    draft.completedSteps = [...new Set([...draft.completedSteps, field])];
    draft.markModified("draftFields");
    await draft.save();
  }

  const reread = await VoiceProfile.findById(draft._id);
  // Zero has to survive Mixed serialization - this is the value the old
  // truthiness guard used to drop.
  assert.strictEqual(reread.draftFields.expectedPay, 0);
  assert.strictEqual(reread.draftFields.experienceYears, 0);
  assert.strictEqual(reread.draftFields.fullName, "स्वरूप पाल");
  assert.strictEqual(reread.draftFields.city, "कोल्हापूर");
  assert.strictEqual(reread.completedSteps.length, 4);
});

test("no audio key is ever written by a guided draft", async () => {
  const workerId = id();
  await VoiceProfile.create({
    workerId,
    language: "mr",
    mode: "guided",
    status: "draft",
    transcript: "spoken words only",
    draftFields: { fullName: "स्वरूप" },
  });

  const stored = await VoiceProfile.collection.findOne({ workerId });
  assert.strictEqual(stored.audioKey, undefined, "recordings are transcribed and deleted, never referenced");
  assert.strictEqual(await VoiceProfile.countDocuments({ audioKey: { $exists: true, $ne: null } }), 0);
});

test("committing a draft flips its status without creating a second document", async () => {
  const workerId = id();
  const draft = await VoiceProfile.create({
    workerId,
    language: "mr",
    mode: "guided",
    status: "draft",
    draftFields: { fullName: "स्वरूप" },
  });

  draft.status = "committed";
  draft.committedAt = new Date();
  await draft.save();

  assert.strictEqual(await VoiceProfile.countDocuments({ workerId, mode: "guided" }), 1);
  const reread = await VoiceProfile.findById(draft._id);
  assert.strictEqual(reread.status, "committed");
  assert.ok(reread.committedAt instanceof Date);
  // The answers are kept as the record of what was applied.
  assert.strictEqual(reread.draftFields.fullName, "स्वरूप");
});
