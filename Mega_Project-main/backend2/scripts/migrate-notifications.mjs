#!/usr/bin/env node
/**
 * Safe, non-destructive, rerunnable migration for Notification idempotency index,
 * interrupted announcement backfill, and role-safe navigation metadata.
 *
 * Usage:
 *   node scripts/migrate-notifications.mjs
 */
import "dotenv/config";
import crypto from "node:crypto";
import mongoose from "mongoose";
import connectDB from "../src/db/index.js";
import Notification from "../src/models/notification.model.js";
import User from "../src/models/user.model.js";
import Application from "../src/models/application.model.js";

async function run() {
  await connectDB();
  const collection = Notification.collection;

  console.log("[Migrate Notifications] Step 1: Unsetting null/empty idempotencyKey fields...");
  const unsetResult = await collection.updateMany(
    { $or: [{ idempotencyKey: null }, { idempotencyKey: "" }] },
    { $unset: { idempotencyKey: "" } }
  );
  console.log(
    `[Migrate Notifications] Unset null/empty idempotencyKey on ${unsetResult.modifiedCount} document(s).`
  );

  console.log("[Migrate Notifications] Step 2: Checking for duplicate non-empty idempotencyKeys...");
  const dupGroups = await collection
    .aggregate([
      { $match: { idempotencyKey: { $type: "string", $gt: "" } } },
      { $group: { _id: "$idempotencyKey", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  for (const grp of dupGroups) {
    // Keep the first document's key intact; disambiguate subsequent copies without deleting data
    const [, ...extraIds] = grp.ids;
    for (const extraId of extraIds) {
      await collection.updateOne(
        { _id: extraId },
        { $set: { idempotencyKey: `${grp._id}_dup_${extraId}` } }
      );
    }
  }
  console.log(`[Migrate Notifications] Duplicate key groups resolved: ${dupGroups.length}.`);

  console.log("[Migrate Notifications] Step 3: Migrating idempotencyKey_1 index to partial unique index...");
  const indexes = await collection.indexes();
  const existingIdx = indexes.find((idx) => idx.name === "idempotencyKey_1");
  if (existingIdx && !existingIdx.partialFilterExpression) {
    console.log("[Migrate Notifications] Dropping legacy sparse idempotencyKey_1 index...");
    await collection.dropIndex("idempotencyKey_1");
  }
  await Notification.syncIndexes();
  const updatedIndexes = await collection.indexes();
  const newIdx = updatedIndexes.find((idx) => idx.name === "idempotencyKey_1");
  console.log("[Migrate Notifications] Active idempotencyKey_1 index:", JSON.stringify(newIdx));

  console.log("[Migrate Notifications] Step 4: Backfilling interrupted admin announcement broadcasts...");
  const announcementDocs = await Notification.find({
    $or: [{ type: "system", "data.announcement": true }, { type: "announcement" }],
  })
    .sort({ createdAt: 1 })
    .lean();

  // Group announcements by broadcastKey or (title.en + body.en + targetRole)
  const broadcastGroups = new Map();
  for (const doc of announcementDocs) {
    const targetRole = doc.data?.targetRole || "all";
    const titleEn = doc.title?.en || "";
    const bodyEn = doc.body?.en || "";
    const broadcastKey =
      doc.data?.broadcastKey ||
      crypto
        .createHash("sha256")
        .update(`legacy:${doc.data?.sentByAdminId || "admin"}:${targetRole}:${titleEn}:${bodyEn}`)
        .digest("hex")
        .slice(0, 24);

    if (!broadcastGroups.has(broadcastKey)) {
      broadcastGroups.set(broadcastKey, {
        broadcastKey,
        seedDoc: doc,
        targetRole,
        recipientUserIds: new Set(),
      });
    }
    const group = broadcastGroups.get(broadcastKey);
    group.recipientUserIds.add(String(doc.userId));

    // Ensure existing doc has its deterministic idempotencyKey and broadcastKey
    const expectedKey = `announcement_${broadcastKey}_${doc.userId}`;
    if (doc.idempotencyKey !== expectedKey || doc.data?.broadcastKey !== broadcastKey) {
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            idempotencyKey: expectedKey,
            "data.broadcastKey": broadcastKey,
            "data.announcement": true,
          },
        }
      );
    }
  }

  let backfilledAnnouncements = 0;
  for (const group of broadcastGroups.values()) {
    const { broadcastKey, seedDoc, targetRole, recipientUserIds } = group;
    const userQuery = { isBlocked: { $ne: true } };
    if (targetRole === "worker") {
      userQuery.roles = "worker";
    } else if (targetRole === "employer") {
      userQuery.roles = "employer";
    }
    const eligibleUsers = await User.find(userQuery).select("_id").lean();
    const missingRecipients = eligibleUsers.filter(
      (u) => !recipientUserIds.has(String(u._id))
    );

    if (missingRecipients.length > 0) {
      const docsToInsert = missingRecipients.map((u) => ({
        userId: u._id,
        type: "system",
        channel: seedDoc.channel || "in_app",
        deliveryStatus: "delivered",
        title: seedDoc.title,
        body: seedDoc.body,
        isRead: false,
        readAt: null,
        idempotencyKey: `announcement_${broadcastKey}_${u._id}`,
        data: {
          ...(seedDoc.data || {}),
          targetRole,
          announcement: true,
          broadcastKey,
        },
        createdAt: seedDoc.createdAt || new Date(),
      }));
      await Notification.insertMany(docsToInsert, { ordered: false });
      backfilledAnnouncements += docsToInsert.length;
    }
  }
  console.log(
    `[Migrate Notifications] Backfilled ${backfilledAnnouncements} missing announcement recipient record(s).`
  );

  console.log("[Migrate Notifications] Step 5: Backfilling role-safe links on application notifications...");
  const appNotifs = await Notification.find({
    type: { $in: ["application_update", "job_alert"] },
    refId: { $ne: null },
  }).lean();

  let enrichedCount = 0;
  for (const n of appNotifs) {
    const app = await Application.findById(n.refId).select("_id jobId initiatedBy").lean();
    if (!app) continue;
    const recipientUser = await User.findById(n.userId).select("roles").lean();
    const roles = recipientUser?.roles || [];
    const isEmployer =
      Boolean(n.data?.senderName) ||
      n.data?.recipientRole === "employer" ||
      (roles.includes("employer") && !roles.includes("worker"));

    const jobIdStr = String(app.jobId);
    const link = isEmployer
      ? `/applicants/${jobIdStr}`
      : app.initiatedBy === "employer"
      ? "/job-requests"
      : "/applications";
    const recipientRole = isEmployer ? "employer" : "worker";

    if (n.data?.jobId !== jobIdStr || n.data?.link !== link) {
      await collection.updateOne(
        { _id: n._id },
        {
          $set: {
            "data.jobId": jobIdStr,
            "data.applicationId": String(app._id),
            "data.recipientRole": recipientRole,
            "data.link": link,
          },
        }
      );
      enrichedCount += 1;
    }
  }
  console.log(`[Migrate Notifications] Enriched ${enrichedCount} application notification(s) with jobId & link.`);

  await mongoose.disconnect();
  console.log("[Migrate Notifications] Complete.");
}

run().catch((err) => {
  console.error("[Migrate Notifications] Failed:", err);
  process.exit(1);
});

