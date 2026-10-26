import mongoose from "mongoose";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import WorkerSkill from "../models/workerSkill.model.js";
import { buildTrilingualNotification } from "../utils/notificationBuilder.js";
import { pickLanguage } from "../utils/languagePicker.js";
import { notificationProviders } from "./notificationProviders/notificationProvider.js";
import logger from "../utils/logger.js";

/**
 * Send notification to user: creates DB notification record, checks idempotency,
 * and dispatches to requested channels (in_app, push, sms, whatsapp, email)
 * with bounded retries and safe error handling.
 *
 * @param {Object} params
 * @param {string} params.userId - Recipient user ID
 * @param {string} params.type - Notification type ("job_alert", "application_update", "payment_update", "system", "dispute", "chat")
 * @param {string} [params.templateKey] - Template key for trilingual builder
 * @param {Object} [params.templateData] - Context data for template
 * @param {string} [params.refId] - Associated entity ID
 * @param {Object} [params.customTitle] - Optional custom trilingual title { mr, hi, en }
 * @param {Object} [params.customBody] - Optional custom trilingual body { mr, hi, en }
 * @param {string} [params.channel="in_app"] - Primary channel
 * @param {string[]} [params.channels] - Optional list of channels to dispatch to
 * @param {string} [params.idempotencyKey] - Optional unique key to prevent duplicate notifications
 * @returns {Promise<Notification|null>}
 */
export const sendNotificationService = async ({
  userId,
  type,
  templateKey,
  templateData = {},
  refId = null,
  customTitle = null,
  customBody = null,
  channel = "in_app",
  channels = null,
  idempotencyKey = null,
}) => {
  try {
    if (!userId || !type) {
      logger.warn("[sendNotificationService] Missing required userId or type");
      return null;
    }

    // 1. Idempotency Check: Avoid duplicates when operations are retried
    if (idempotencyKey && (mongoose.connection?.readyState === 1 || Notification.findOne?.mock)) {
      const existing = await Notification.findOne({ idempotencyKey });
      if (existing) {
        logger.info(`[sendNotificationService] Duplicate suppressed for idempotencyKey: ${idempotencyKey}`);
        return existing;
      }
    }

    // 2. Build multilingual title and body
    const { title, body } = buildTrilingualNotification(
      templateKey,
      templateData,
      customTitle,
      customBody
    );

    // 3. Create In-App Notification in DB
    let notification;
    try {
      notification = await Notification.create({
        userId,
        type,
        title,
        body,
        refId,
        data: templateData,
        channel,
        deliveryStatus: "delivered", // Immediately delivered in DB for in-app inbox
        attempts: 1,
        idempotencyKey: idempotencyKey || null,
      });
    } catch (err) {
      // Handle race condition duplicate key E11000
      if (err.code === 11000 && idempotencyKey) {
        logger.info(`[sendNotificationService] Concurrent duplicate caught for idempotencyKey: ${idempotencyKey}`);
        if (mongoose.connection?.readyState === 1 || Notification.findOne?.mock) {
          return await Notification.findOne({ idempotencyKey });
        }
      }
      throw err;
    }

    // 4. Resolve recipient user for preferred language and external contact info
    let recipientUser = null;
    if (mongoose.connection?.readyState === 1 || User.findById?.mock) {
      try {
        recipientUser = await User.findById(userId).select("preferredLanguage phone email isBlocked").lean();
      } catch (userErr) {
        // Safe fallback in test or disconnected environment
      }
    }

    if (recipientUser && recipientUser.isBlocked) {
      return notification;
    }

    const preferredLang = recipientUser?.preferredLanguage || templateData?.preferredLanguage || "en";
    const localizedTitle = pickLanguage(title, preferredLang, "en");
    const localizedBody = pickLanguage(body, preferredLang, "en");

    // 5. Determine external dispatch channels
    const dispatchChannels = new Set();
    if (Array.isArray(channels)) {
      channels.forEach((c) => dispatchChannels.add(c));
    } else if (channel && channel !== "in_app") {
      dispatchChannels.add(channel);
    } else {
      // By default, also attempt push notification if device tokens exist
      dispatchChannels.add("push");
    }

    // 6. Dispatch to each external channel safely (never breaking the workflow)
    for (const targetChannel of dispatchChannels) {
      if (targetChannel === "in_app") continue; // Already persisted in DB

      const provider = notificationProviders[targetChannel];
      if (!provider) continue;

      let destination = userId;
      if (targetChannel === "sms" || targetChannel === "whatsapp") {
        destination = recipientUser.phone;
      } else if (targetChannel === "email") {
        destination = recipientUser.email;
      }

      try {
        const providerResult = await provider.send({
          to: destination,
          title: localizedTitle,
          body: localizedBody,
          metadata: {
            notificationId: notification._id,
            type,
            refId,
            preferredLanguage: preferredLang,
          },
        });

        if (providerResult && targetChannel === channel) {
          // If this was the designated primary channel, reflect status on the notification
          if (mongoose.connection?.readyState === 1 || Notification.findByIdAndUpdate?.mock) {
            await Notification.findByIdAndUpdate(notification._id, {
              deliveryStatus: providerResult.status,
              attempts: providerResult.attempts || 1,
              externalId: providerResult.externalId || null,
              errorMetadata: providerResult.error ? { message: providerResult.error } : null,
            });
          }
        }
      } catch (externalErr) {
        logger.warn(`[sendNotificationService] External channel ${targetChannel} failed:`, externalErr?.message);
        if (targetChannel === channel) {
          if (mongoose.connection?.readyState === 1 || Notification.findByIdAndUpdate?.mock) {
            await Notification.findByIdAndUpdate(notification._id, {
              deliveryStatus: "failed",
              errorMetadata: { message: externalErr?.message || "Channel delivery error" },
            });
          }
        }
      }
    }

    return notification;
  } catch (error) {
    logger.error(`Notification Dispatch Error for user ${userId}:`, error);
    return null;
  }
};

/**
 * Asynchronously notify relevant workers when a new job is posted.
 *
 * @param {Object} job - Created Job document
 * @param {number} [maxWorkers=10] - Bounded maximum workers to notify
 */
export const notifyMatchingWorkersForJob = async (job, maxWorkers = 10) => {
  try {
    if (!job || job.status !== "open") return;
    if (mongoose.connection?.readyState !== 1 && !WorkerProfile.find?.mock) return;

    const workerUserIds = new Set();

    // Match by category
    if (job.categoryId) {
      const workersInCategory = await WorkerProfile.find({
        preferredJobCategories: job.categoryId,
        isAvailable: true,
      })
        .select("userId")
        .limit(maxWorkers);

      for (const w of workersInCategory) {
        if (w.userId) workerUserIds.add(w.userId.toString());
      }
    }

    // Match by skills if we still have capacity
    if (workerUserIds.size < maxWorkers && Array.isArray(job.skillIds) && job.skillIds.length > 0) {
      const skills = await WorkerSkill.find({
        skillId: { $in: job.skillIds },
      })
        .select("workerProfileId")
        .limit(maxWorkers * 2);

      const profileIds = skills.map((s) => s.workerProfileId);
      const workersWithSkills = await WorkerProfile.find({
        _id: { $in: profileIds },
        isAvailable: true,
      })
        .select("userId")
        .limit(maxWorkers);

      for (const w of workersWithSkills) {
        if (w.userId) workerUserIds.add(w.userId.toString());
      }
    }

    const jobTitleEn = job.title?.en || job.titleText || "Job";
    const payAmount = job.payAmount || 0;
    const payType = job.payType || "day";

    let count = 0;
    for (const workerUserId of workerUserIds) {
      if (count >= maxWorkers) break;

      await sendNotificationService({
        userId: workerUserId,
        type: "job_alert",
        templateKey: "JOB_ALERT",
        templateData: {
          jobTitle: jobTitleEn,
          payAmount,
          payType,
        },
        refId: job._id,
        idempotencyKey: `job_alert_${job._id}_${workerUserId}`,
      });

      count++;
    }

    logger.info(`[notifyMatchingWorkersForJob] Dispatched job alerts for job ${job._id} to ${count} workers`);
  } catch (err) {
    logger.warn("[notifyMatchingWorkersForJob] Failed to dispatch job alerts:", err?.message);
  }
};
