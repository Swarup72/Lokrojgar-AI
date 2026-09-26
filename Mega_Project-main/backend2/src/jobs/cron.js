import fs from "fs";
import path from "path";
import Offer from "../models/offer.model.js";
import Job from "../models/job.model.js";
import Shift from "../models/shift.model.js";
import logger from "../utils/logger.js";

/**
 * 1. Expire offers past their expiresAt date
 */
export const expireOffersJob = async () => {
  try {
    const result = await Offer.updateMany(
      { status: "sent", expiresAt: { $lt: new Date() } },
      { status: "expired" }
    );
    if (result.modifiedCount > 0) {
      logger.info(`[CRON] Expired ${result.modifiedCount} job offers.`);
    }
  } catch (error) {
    logger.error("[CRON] Expire Offers Job Error:", error);
  }
};

/**
 * 2. Expire jobs past application deadline
 */
export const expireJobsJob = async () => {
  try {
    const result = await Job.updateMany(
      { status: "open", applicationDeadline: { $lt: new Date() } },
      { status: "expired" }
    );
    if (result.modifiedCount > 0) {
      logger.info(`[CRON] Expired ${result.modifiedCount} past-deadline jobs.`);
    }
  } catch (error) {
    logger.error("[CRON] Expire Jobs Job Error:", error);
  }
};

/**
 * 3. Mark missed shifts
 */
export const markMissedShiftsJob = async () => {
  try {
    const now = new Date();
    const result = await Shift.updateMany(
      { status: "scheduled", shiftDate: { $lt: now } },
      { status: "missed" }
    );
    if (result.modifiedCount > 0) {
      logger.info(`[CRON] Marked ${result.modifiedCount} shifts as missed.`);
    }
  } catch (error) {
    logger.error("[CRON] Mark Missed Shifts Error:", error);
  }
};

/**
 * 4. Clean public/temp directory of files older than 1 hour
 */
export const cleanTempDirectoryJob = async () => {
  try {
    const tempDir = "./public/temp";
    if (!fs.existsSync(tempDir)) return;

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      // If older than 1 hour (3600,000 ms)
      if (now - stats.mtimeMs > 3600000) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`[CRON] Cleaned ${deletedCount} temporary files from public/temp.`);
    }
  } catch (error) {
    logger.error("[CRON] Clean Temp Directory Error:", error);
  }
};

/**
 * Initialize all cron background tasks
 */
export const initCronJobs = () => {
  logger.info("Initializing Cron Background Tasks...");

  // Run tasks immediately on startup
  expireOffersJob();
  expireJobsJob();
  markMissedShiftsJob();
  cleanTempDirectoryJob();

  // Schedule intervals:
  // - Offers & Jobs expiry: Every 15 minutes
  setInterval(expireOffersJob, 15 * 60 * 1000);
  setInterval(expireJobsJob, 15 * 60 * 1000);

  // - Missed shifts check: Every 30 minutes
  setInterval(markMissedShiftsJob, 30 * 60 * 1000);

  // - Temp directory cleanup: Every 1 hour
  setInterval(cleanTempDirectoryJob, 60 * 60 * 1000);
};
