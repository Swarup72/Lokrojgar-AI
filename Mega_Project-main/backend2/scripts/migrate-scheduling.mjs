#!/usr/bin/env node
/**
 * Safe, non-destructive migration & index builder for Worker Availability & Appointments.
 *
 * Usage:
 *   node scripts/migrate-scheduling.mjs          # Build indexes & ensure default availability docs
 *   node scripts/migrate-scheduling.mjs --rollback  # Drop only scheduling collections (if rolling back)
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/db/index.js";
import WorkerProfile from "../src/models/workerProfile.model.js";
import WorkerAvailability, { DEFAULT_WEEKLY_SCHEDULE } from "../src/models/workerAvailability.model.js";
import Appointment from "../src/models/appointment.model.js";
import { DEFAULT_TIME_ZONE } from "../src/utils/scheduling/time.js";

const isRollback = process.argv.includes("--rollback");

async function run() {
  await connectDB();
  if (isRollback) {
    console.log("[Rollback] Dropping scheduling collections (workeravailabilities, appointments)...");
    await mongoose.connection.collection("workeravailabilities").drop().catch(() => {});
    await mongoose.connection.collection("appointments").drop().catch(() => {});
    console.log("[Rollback] Complete. Existing WorkerProfile and EmployerProfile records untouched.");
    await mongoose.disconnect();
    return;
  }

  console.log("[Migrate] Ensuring indexes for WorkerAvailability and Appointment...");
  await WorkerAvailability.syncIndexes();
  await Appointment.syncIndexes();

  const workers = await WorkerProfile.find({}).select("_id").lean();
  let createdCount = 0;
  for (const w of workers) {
    const res = await WorkerAvailability.updateOne(
      { workerId: w._id },
      {
        $setOnInsert: {
          workerId: w._id,
          timeZone: DEFAULT_TIME_ZONE,
          weekly: DEFAULT_WEEKLY_SCHEDULE,
          exceptions: [],
          scheduleVersion: 1,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0) createdCount += 1;
  }

  console.log(`[Migrate] Done. Total workers: ${workers.length}, newly initialized schedules: ${createdCount}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[Migrate] Failed:", err);
  process.exit(1);
});
