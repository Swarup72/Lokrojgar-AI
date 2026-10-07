#!/usr/bin/env node
/**
 * Prepares existing VoiceProfile documents for the guided voice flow.
 *
 * Two things changed that pre-existing documents predate:
 *
 *   1. `mode` ("quick" | "guided"). Every document that existed before the
 *      guided flow came from the single-recording flow, so "quick" is the
 *      historically correct value - not a guess.
 *
 *   2. The unique index moved from { workerId, language } to
 *      { workerId, language, mode }, because the two flows would otherwise
 *      collide on the same key and silently overwrite each other.
 *
 * The backfill is REQUIRED by that index change rather than optional: with
 * `mode` absent, MongoDB indexes the old documents under a null mode, so a new
 * quick-flow upsert (which sets mode: "quick") would create a SECOND document
 * for the same worker and language and leave the original stranded.
 *
 * Safe by construction: it only ever FILLS absent fields. Nothing is renamed,
 * overwritten or deleted, no transcript is touched, and re-running it is a
 * no-op. Defaults to a dry run.
 *
 *   node scripts/backfill-voiceprofile-mode.mjs            # dry run
 *   node scripts/backfill-voiceprofile-mode.mjs --apply    # write
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import VoiceProfile from "../src/models/voiceProfile.model.js";
import { DB_NAME } from "../src/constants.js";

dotenv.config();

const apply = process.argv.includes("--apply");
const baseUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const uri = /\/[^/?]+(\?|$)/.test(baseUri.replace(/^mongodb(\+srv)?:\/\//, "")) ? baseUri : `${baseUri}/${DB_NAME}`;

const OLD_INDEX = "workerId_1_language_1";
const NEW_INDEX = "workerId_1_language_1_mode_1";

const main = async () => {
  await mongoose.connect(uri);
  console.log(`${apply ? "APPLYING" : "DRY RUN"} against ${mongoose.connection.name}\n`);
  const collection = VoiceProfile.collection;

  // --- 1. Fill in `mode` -----------------------------------------------------
  const missing = await collection.countDocuments({ mode: { $exists: false } });
  console.log(`documents without a mode: ${missing}  (all pre-date the guided flow, so all are "quick")`);
  if (missing > 0 && apply) {
    const result = await collection.updateMany({ mode: { $exists: false } }, { $set: { mode: "quick" } });
    console.log(`  set mode="quick" on ${result.modifiedCount}`);
  }

  // `status` has a schema default, but documents written before it existed have
  // no value at all; they were all applied already, so "committed" is correct.
  const missingStatus = await collection.countDocuments({ status: { $exists: false } });
  console.log(`documents without a status: ${missingStatus}  (already applied, so "committed")`);
  if (missingStatus > 0 && apply) {
    const result = await collection.updateMany({ status: { $exists: false } }, { $set: { status: "committed" } });
    console.log(`  set status="committed" on ${result.modifiedCount}`);
  }

  // --- 2. Swap the unique index -------------------------------------------
  const indexes = await collection.indexes();
  const names = indexes.map((index) => index.name);
  console.log(`\nindexes now: ${names.join(", ")}`);

  if (names.includes(OLD_INDEX)) {
    console.log(`  will DROP ${OLD_INDEX} (superseded - it cannot tell the two flows apart)`);
    // Dropped only after `mode` is populated, so the new index can be built
    // without the old one rejecting the intermediate state.
    if (apply) await collection.dropIndex(OLD_INDEX);
  }
  if (!names.includes(NEW_INDEX)) {
    console.log(`  will CREATE ${NEW_INDEX} (unique)`);
    if (apply) await collection.createIndex({ workerId: 1, language: 1, mode: 1 }, { unique: true });
  }

  if (apply) {
    const after = (await collection.indexes()).map((index) => index.name);
    console.log(`\nindexes after: ${after.join(", ")}`);
    const stillMissing = await collection.countDocuments({ mode: { $exists: false } });
    console.log(`documents still without a mode: ${stillMissing}`);
    if (stillMissing > 0) process.exitCode = 1;
  } else {
    console.log("\nNothing was written. Re-run with --apply to perform the changes.");
  }

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
