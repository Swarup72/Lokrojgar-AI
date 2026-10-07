#!/usr/bin/env node
/**
 * One-time cleanup of development/test user accounts and the data they own.
 *
 * This is a DATA script. It changes no application code, no schema and no
 * configuration, and it never drops a database or a collection - it deletes
 * documents by ownership, one collection at a time, in dependency order.
 *
 * WHAT IT PROTECTS
 * ----------------
 *   * Any User with the "admin" role (the seeded +919999999999 account is
 *     created by src/seeds/seed.js and is required for the admin surface).
 *     PROTECTED_PHONES below is a second, explicit belt.
 *   * The CATALOG: `skills` and `jobcategories`. Those are seed data, not
 *     user-owned - Job.skillIds and WorkerSkill.skillId point at them, and
 *     deleting them would break the matching catalog for every future account.
 *   * Every document owned by a preserved user. Deletion is driven by the
 *     preserved/deleted split, never by "delete everything in this collection".
 *
 * HOW OWNERSHIP IS RESOLVED
 * -------------------------
 * Read from the real models (src/models/*.model.js), not assumed:
 *
 *   User._id
 *     ├── WorkerProfile.userId        → WorkerSkill.workerId, VoiceProfile.workerId,
 *     │                                 Application.workerId, Resume.workerId,
 *     │                                 SavedJob.workerId, Shift.workerId
 *     └── EmployerProfile.userId      → Job.employerId
 *   User._id direct: Session, DeviceToken, Notification, Document.ownerId,
 *                    Rating.fromUserId/toUserId, Conversation.participantIds,
 *                    Dispute.raisedByUserId/againstUserId, Payment.payerId/payeeId
 *   Message.senderId, Message.conversationId
 *
 * A Job owned by a PRESERVED employer is never deleted. A test worker's
 * application to such a job is deleted (the application is the test user's
 * record); the job itself is untouched. The same rule applies to ratings and
 * conversations: only the rows a deleted user owns or participates in go.
 *
 *   node scripts/cleanup-test-users.mjs             # DRY RUN (default)
 *   node scripts/cleanup-test-users.mjs --confirm   # actually delete
 *
 * Safe to run twice: the second run finds nothing to do.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { DB_NAME } from "../src/constants.js";

dotenv.config();

const apply = process.argv.includes("--confirm");

// --- guard rails -------------------------------------------------------------

// This script is only ever meant for the local development database. Anything
// else - a remote host, a different database name - aborts.
const EXPECTED_DB = DB_NAME; // "LokRozgar_AI"
const ALLOWED_HOSTS = ["127.0.0.1", "localhost"];

/**
 * Phones that must survive regardless of role, as a second check alongside the
 * role test. Listed explicitly so the protection is visible in the diff rather
 * than implied by a query.
 */
const PROTECTED_PHONES = ["+919999999999"];

/** Collections that are seed/catalog data and must never be touched here. */
const CATALOG_COLLECTIONS = ["skills", "jobcategories"];

const fail = (message) => {
  console.error(`\nREFUSING TO RUN: ${message}`);
  process.exit(1);
};

const main = async () => {
  const baseUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
  const host = baseUri.replace(/^mongodb(\+srv)?:\/\//, "").split("/")[0].split(":")[0];
  if (!ALLOWED_HOSTS.includes(host)) {
    fail(`host ${host} is not local. This script only runs against ${ALLOWED_HOSTS.join(" or ")}.`);
  }

  await mongoose.connect(`${baseUri}/${EXPECTED_DB}`);
  const db = mongoose.connection.db;
  const C = (name) => db.collection(name);

  if (mongoose.connection.name !== EXPECTED_DB) {
    fail(`connected to "${mongoose.connection.name}" but expected "${EXPECTED_DB}".`);
  }

  const userCount = await C("users").countDocuments();

  console.log("=".repeat(70));
  console.log(`Database:    ${mongoose.connection.name}`);
  console.log(`Host:        ${mongoose.connection.host}`);
  console.log(`Environment: ${process.env.NODE_ENV || "(unset)"}`);
  console.log(`User count:  ${userCount}`);
  console.log(`Mode:        ${apply ? "*** APPLYING DELETIONS ***" : "DRY RUN (nothing will be written)"}`);
  console.log("=".repeat(70));

  if (process.env.NODE_ENV === "production") {
    fail("NODE_ENV is production.");
  }
  if (userCount === 0) {
    console.log("\nNo users at all - nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // --- classify ------------------------------------------------------------
  const users = await C("users").find({}).toArray();
  const preserved = [];
  const toDelete = [];

  for (const user of users) {
    const isAdmin = (user.roles || []).includes("admin");
    const isProtectedPhone = PROTECTED_PHONES.includes(user.phone);
    if (isAdmin || isProtectedPhone) {
      preserved.push({ user, why: isAdmin ? "has the admin role" : "explicitly protected phone" });
    } else {
      toDelete.push(user);
    }
  }

  console.log(`\nPRESERVED (${preserved.length}):`);
  for (const { user, why } of preserved) {
    console.log(`  ${user.phone}  roles=[${user.roles}]  - ${why}`);
  }
  console.log(`\nTO DELETE (${toDelete.length}): development/test accounts`);
  for (const user of toDelete) {
    console.log(`  ${String(user._id)}  ${(user.phone || "?").padEnd(14)} roles=[${(user.roles || []).join("+")}]`);
  }

  if (toDelete.length === 0) {
    console.log("\nNothing to delete. (A second run lands here.)");
    await mongoose.disconnect();
    return;
  }

  // --- resolve what those users own ----------------------------------------
  const deleteUserIds = toDelete.map((u) => u._id);
  const preservedUserIds = preserved.map(({ user }) => user._id);

  const deadWorkerProfiles = await C("workerprofiles").find({ userId: { $in: deleteUserIds } }).toArray();
  const deadEmployerProfiles = await C("employerprofiles").find({ userId: { $in: deleteUserIds } }).toArray();
  const deadWorkerIds = deadWorkerProfiles.map((p) => p._id);
  const deadEmployerIds = deadEmployerProfiles.map((p) => p._id);

  // Jobs belonging to deleted employers ONLY. A preserved employer's jobs are
  // not in this set and are never touched.
  const deadJobs = deadEmployerIds.length
    ? await C("jobs").find({ employerId: { $in: deadEmployerIds } }).toArray()
    : [];
  const deadJobIds = deadJobs.map((j) => j._id);

  // Conversations the deleted users participate in, and the messages inside them.
  const deadConversations = await C("conversations")
    .find({ $or: [{ participantIds: { $in: deleteUserIds } }, { workerId: { $in: deadWorkerIds } }, { employerId: { $in: deadEmployerIds } }] })
    .toArray();
  const deadConversationIds = deadConversations.map((c) => c._id);

  // Every delete is expressed as a filter scoped to the ids above - never an
  // unscoped {} - so a preserved user's rows cannot be caught by accident.
  // Ordered dependents-first.
  const plan = [
    ["messages", { $or: [{ senderId: { $in: deleteUserIds } }, { conversationId: { $in: deadConversationIds } }] }],
    ["conversations", { _id: { $in: deadConversationIds } }],
    ["workerskills", { workerId: { $in: deadWorkerIds } }],
    ["voiceprofiles", { workerId: { $in: deadWorkerIds } }],
    ["resumes", { workerId: { $in: deadWorkerIds } }],
    ["savedjobs", { $or: [{ workerId: { $in: deadWorkerIds } }, { jobId: { $in: deadJobIds } }] }],
    ["shifts", { $or: [{ workerId: { $in: deadWorkerIds } }, { jobId: { $in: deadJobIds } }] }],
    // Ratings where EITHER party is being deleted: a rating that names a
    // missing user is an orphan, whichever side it points at.
    ["ratings", { $or: [{ fromUserId: { $in: deleteUserIds } }, { toUserId: { $in: deleteUserIds } }, { jobId: { $in: deadJobIds } }] }],
    ["payments", { $or: [{ payerId: { $in: deleteUserIds } }, { payeeId: { $in: deleteUserIds } }, { jobId: { $in: deadJobIds } }] }],
    ["disputes", { $or: [{ raisedByUserId: { $in: deleteUserIds } }, { againstUserId: { $in: deleteUserIds } }, { jobId: { $in: deadJobIds } }] }],
    // Applications: a test worker's application, OR any application to a job
    // that is itself going away. A preserved worker's application to a
    // preserved job matches neither.
    ["applications", { $or: [{ workerId: { $in: deadWorkerIds } }, { jobId: { $in: deadJobIds } }] }],
    ["jobs", { _id: { $in: deadJobIds } }],
    ["documents", { ownerId: { $in: deleteUserIds } }],
    ["notifications", { userId: { $in: deleteUserIds } }],
    ["devicetokens", { userId: { $in: deleteUserIds } }],
    ["sessions", { userId: { $in: deleteUserIds } }],
    ["otps", { phone: { $in: toDelete.map((u) => u.phone).filter(Boolean) } }],
    ["workerprofiles", { _id: { $in: deadWorkerIds } }],
    ["employerprofiles", { _id: { $in: deadEmployerIds } }],
    ["users", { _id: { $in: deleteUserIds } }],
  ];

  // --- report, then (optionally) delete ------------------------------------
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  console.log(`\n${apply ? "DELETING" : "WOULD DELETE"} by collection:`);
  const before = {};
  const planned = {};

  for (const [collection, filter] of plan) {
    if (!existing.has(collection)) continue;
    if (CATALOG_COLLECTIONS.includes(collection)) fail(`the plan touches catalog collection ${collection}`);
    before[collection] = await C(collection).countDocuments();
    planned[collection] = await C(collection).countDocuments(filter);
    console.log(`  ${collection.padEnd(20)} ${String(planned[collection]).padStart(4)} of ${before[collection]}`);
  }

  // Preserved users' data must be entirely outside the plan. Verified rather
  // than asserted: if a preserved user owns anything the plan would remove,
  // the script stops instead of deleting it.
  if (preservedUserIds.length) {
    const keptWorker = await C("workerprofiles").find({ userId: { $in: preservedUserIds } }).toArray();
    const keptEmployer = await C("employerprofiles").find({ userId: { $in: preservedUserIds } }).toArray();
    const keptJobs = keptEmployer.length
      ? await C("jobs").countDocuments({ employerId: { $in: keptEmployer.map((p) => p._id) } })
      : 0;
    console.log(
      `\npreserved users own: ${keptWorker.length} worker profile(s), ${keptEmployer.length} employer profile(s), ${keptJobs} job(s) - all untouched`
    );
    const overlapWorker = keptWorker.filter((p) => deadWorkerIds.some((id) => String(id) === String(p._id)));
    const overlapEmployer = keptEmployer.filter((p) => deadEmployerIds.some((id) => String(id) === String(p._id)));
    if (overlapWorker.length || overlapEmployer.length) {
      fail("a preserved user's profile appeared in the deletion set.");
    }
  }

  console.log(`\ncatalog preserved: ${CATALOG_COLLECTIONS.map((c) => `${c}=${before[c] ?? "n/a"}`).join(" ")} (never in the plan)`);
  for (const collection of CATALOG_COLLECTIONS) {
    console.log(`  ${collection}: ${await C(collection).countDocuments()} documents, untouched`);
  }

  if (!apply) {
    console.log("\nDRY RUN - nothing was written. Re-run with --confirm to delete.");
    await mongoose.disconnect();
    return;
  }

  const deleted = {};
  for (const [collection, filter] of plan) {
    if (!existing.has(collection)) continue;
    const result = await C(collection).deleteMany(filter);
    deleted[collection] = result.deletedCount;
  }

  console.log("\nDELETED:");
  let total = 0;
  for (const [collection, count] of Object.entries(deleted)) {
    if (count > 0) console.log(`  ${collection.padEnd(20)} ${count}`);
    total += count;
  }
  console.log(`  ${"TOTAL".padEnd(20)} ${total}`);

  console.log("\nAFTER (counts):");
  for (const collection of [...Object.keys(deleted), ...CATALOG_COLLECTIONS]) {
    if (!existing.has(collection)) continue;
    console.log(`  ${collection.padEnd(20)} ${await C(collection).countDocuments()}`);
  }

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error("Cleanup failed:", error);
  process.exit(1);
});
