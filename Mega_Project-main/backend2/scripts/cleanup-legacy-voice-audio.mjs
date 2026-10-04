#!/usr/bin/env node
/**
 * One-off cleanup of legacy voice-profile audio in Backblaze B2.
 *
 * Voice recordings are no longer uploaded anywhere (H-7): they are
 * transcribed and deleted in the same request. Everything under
 * voice-profiles/ is therefore audio from the old behaviour, which nothing
 * in the product can read. This removes it.
 *
 * NOT a cron job and not wired into the app - run it by hand, once.
 *
 * Safety:
 *   - dry run unless --confirm is passed; prints exactly what it would do
 *   - only ever touches keys under the voice-profiles/ prefix
 *   - skips objects newer than --min-age-hours (default 24)
 *   - --keep-referenced leaves objects still named by a VoiceProfile.audioKey
 *   - clears audioKey on rows whose object it deleted, so the DB does not
 *     keep pointing at something that is gone
 *
 * Usage:
 *   node scripts/cleanup-legacy-voice-audio.mjs                 # dry run
 *   node scripts/cleanup-legacy-voice-audio.mjs --keep-referenced
 *   node scripts/cleanup-legacy-voice-audio.mjs --confirm       # delete
 */
import dotenv from "dotenv";
dotenv.config({ path: "./.env", quiet: true });
import { ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import mongoose from "mongoose";
import { getB2Client } from "../src/utils/b2.js";
import { DB_NAME } from "../src/constants.js";

const PREFIX = "voice-profiles/";
const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const keepReferenced = args.includes("--keep-referenced");
const minAgeHours = Number((args.find((a) => a.startsWith("--min-age-hours=")) || "").split("=")[1] ?? 24);

const client = getB2Client();
const bucket = process.env.B2_BUCKET_NAME;

const objects = [];
let token;
do {
  const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }));
  for (const o of page.Contents || []) objects.push({ key: o.Key, size: o.Size, at: o.LastModified });
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
const rows = await mongoose.connection.db
  .collection("voiceprofiles")
  .find({ audioKey: { $exists: true, $ne: null } }, { projection: { audioKey: 1 } })
  .toArray();
const referenced = new Set(rows.map((r) => r.audioKey));

const cutoff = Date.now() - minAgeHours * 3600 * 1000;
const tooNew = objects.filter((o) => o.at.getTime() > cutoff);
let candidates = objects.filter((o) => o.at.getTime() <= cutoff);
const skippedReferenced = keepReferenced ? candidates.filter((o) => referenced.has(o.key)) : [];
if (keepReferenced) candidates = candidates.filter((o) => !referenced.has(o.key));

const bytes = candidates.reduce((a, o) => a + (o.size || 0), 0);
console.log(`mode                      : ${confirm ? "DELETE" : "DRY RUN (pass --confirm to delete)"}`);
console.log(`bucket prefix             : ${PREFIX}`);
console.log(`objects found             : ${objects.length}`);
console.log(`still referenced by a row : ${objects.filter((o) => referenced.has(o.key)).length}`);
console.log(`skipped, newer than ${minAgeHours}h  : ${tooNew.length}`);
console.log(`skipped, --keep-referenced: ${skippedReferenced.length}`);
console.log(`WOULD DELETE              : ${candidates.length} object(s), ${(bytes / 1024 / 1024).toFixed(2)} MB`);

let deleted = 0;
for (const o of candidates) {
  if (!o.key.startsWith(PREFIX)) throw new Error(`refusing to touch ${o.key}: outside ${PREFIX}`);
  if (!confirm) { console.log(`  would delete  ${o.at.toISOString()}  ${o.key}`); continue; }
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.key }));
  const res = await mongoose.connection.db.collection("voiceprofiles")
    .updateMany({ audioKey: o.key }, { $unset: { audioKey: "" } });
  deleted += 1;
  console.log(`  deleted  ${o.key}${res.modifiedCount ? `  (cleared audioKey on ${res.modifiedCount} row)` : ""}`);
}

if (confirm) console.log(`\ndeleted ${deleted} object(s)`);
else console.log(`\nnothing was deleted. Re-run with --confirm to apply.`);
await mongoose.disconnect();
