import mongoose from "mongoose";
import Notification from "../models/notification.model.js";
import Application from "../models/application.model.js";
import Job from "../models/job.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pickLanguage } from "../utils/languagePicker.js";

/**
 * Resolve role-safe navigation link and entity availability for a notification.
 */
export function resolveNotificationTarget(n, user, appMap = new Map(), jobMap = new Map(), dbResolved = false) {
  const roles = Array.isArray(user?.roles)
    ? user.roles
    : user?.role
    ? [user.role]
    : [];
  const isEmployerOnly = roles.includes("employer") && !roles.includes("worker");
  const isEmployerRecipient =
    n.data?.recipientRole === "employer" ||
    Boolean(n.data?.senderName) ||
    isEmployerOnly;

  const refStr = n.refId ? String(n.refId) : null;
  const app = refStr ? appMap.get(refStr) : null;

  if (n.type === "system") {
    if (typeof n.data?.link === "string" && n.data.link.startsWith("/")) {
      // Guard against sending an employer-only user to a worker-only route
      if (isEmployerOnly && n.data.link === "/applications") {
        return { targetLink: "/employer-dashboard", targetUnavailable: false, jobId: null };
      }
      return { targetLink: n.data.link, targetUnavailable: false, jobId: n.data?.jobId || null };
    }
    return { targetLink: null, targetUnavailable: false, jobId: null };
  }

  if (n.type === "application_update") {
    if (
      n.data?.kind === "appointment" ||
      n.data?.link === "/worker-availability" ||
      n.data?.link === "/employer-appointments"
    ) {
      return {
        targetLink: isEmployerOnly ? "/employer-appointments" : n.data?.link || "/worker-availability",
        targetUnavailable: false,
        jobId: null,
      };
    }

    const resolvedJobId = n.data?.jobId
      ? String(n.data.jobId)
      : app?.jobId
      ? String(app.jobId)
      : null;

    if (isEmployerRecipient) {
      if (dbResolved && refStr && !app && !n.data?.jobId) {
        return { targetLink: "/employer-dashboard", targetUnavailable: true, jobId: null };
      }
      if (resolvedJobId) {
        if (dbResolved && jobMap.has(resolvedJobId) && !jobMap.get(resolvedJobId)) {
          return { targetLink: "/employer-dashboard", targetUnavailable: true, jobId: resolvedJobId };
        }
        return {
          targetLink: `/applicants/${resolvedJobId}`,
          targetUnavailable: false,
          jobId: resolvedJobId,
        };
      }
      return { targetLink: "/employer-dashboard", targetUnavailable: false, jobId: null };
    }

    // Worker recipient
    if (n.data?.link === "/job-requests" || app?.initiatedBy === "employer") {
      return { targetLink: "/job-requests", targetUnavailable: false, jobId: resolvedJobId };
    }
    return { targetLink: "/applications", targetUnavailable: false, jobId: resolvedJobId };
  }

  if (n.type === "job_alert") {
    if (n.data?.link === "/job-requests" || app?.initiatedBy === "employer") {
      return {
        targetLink: "/job-requests",
        targetUnavailable: false,
        jobId: app?.jobId ? String(app.jobId) : n.data?.jobId || null,
      };
    }

    const resolvedJobId = n.data?.jobId
      ? String(n.data.jobId)
      : app?.jobId
      ? String(app.jobId)
      : refStr;

    if (resolvedJobId) {
      if (dbResolved && jobMap.has(resolvedJobId) && !jobMap.get(resolvedJobId)) {
        return { targetLink: "/jobs", targetUnavailable: true, jobId: resolvedJobId };
      }
      return { targetLink: `/jobs/${resolvedJobId}`, targetUnavailable: false, jobId: resolvedJobId };
    }
    return { targetLink: "/jobs", targetUnavailable: false, jobId: null };
  }

  if (n.type === "chat") {
    return { targetLink: "/messages", targetUnavailable: false, jobId: null };
  }

  if (typeof n.data?.link === "string" && n.data.link.startsWith("/")) {
    if (isEmployerOnly && n.data.link === "/applications") {
      return { targetLink: "/employer-dashboard", targetUnavailable: false, jobId: null };
    }
    return { targetLink: n.data.link, targetUnavailable: false, jobId: n.data?.jobId || null };
  }

  if (n.type === "payment_update" || n.type === "dispute") {
    return {
      targetLink: isEmployerRecipient ? "/employer-dashboard" : "/applications",
      targetUnavailable: false,
      jobId: null,
    };
  }

  return { targetLink: null, targetUnavailable: false, jobId: null };
}

/**
 * Get paginated notifications for authenticated user with language localization
 * and optional read/type filters.
 */
export const getNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const { isRead, type } = req.query;

  // Strict ownership: users can ONLY query their own notifications
  const query = { userId: req.user._id };

  if (isRead !== undefined && isRead !== "") {
    query.isRead = isRead === "true" || isRead === true;
  }

  if (type && typeof type === "string") {
    query.type = type.trim();
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ userId: req.user._id, isRead: false }),
  ]);

  // Batch-resolve referenced applications and jobs when connected to MongoDB
  const appMap = new Map();
  const jobMap = new Map();
  const canQueryModels =
    mongoose.connection?.readyState === 1 ||
    Boolean(Application.find?.mock) ||
    Boolean(Job.find?.mock);

  if (canQueryModels && notifications.length > 0) {
    try {
      const refIds = [
        ...new Set(
          notifications
            .filter((n) => (n.type === "application_update" || n.type === "job_alert") && n.refId && mongoose.isValidObjectId(n.refId))
            .map((n) => String(n.refId))
        ),
      ];

      if (refIds.length > 0 && (mongoose.connection?.readyState === 1 || Application.find?.mock)) {
        const apps = await Application.find({ _id: { $in: refIds } })
          .select("_id jobId initiatedBy status")
          .lean();
        if (Array.isArray(apps)) {
          for (const a of apps) {
            appMap.set(String(a._id), a);
          }
        }
      }

      const jobIdsToVerify = new Set();
      for (const n of notifications) {
        if (n.data?.jobId && mongoose.isValidObjectId(n.data.jobId)) {
          jobIdsToVerify.add(String(n.data.jobId));
        }
        const app = n.refId ? appMap.get(String(n.refId)) : null;
        if (app?.jobId && mongoose.isValidObjectId(app.jobId)) {
          jobIdsToVerify.add(String(app.jobId));
        } else if (n.type === "job_alert" && n.refId && !app && mongoose.isValidObjectId(n.refId)) {
          jobIdsToVerify.add(String(n.refId));
        }
      }

      if (jobIdsToVerify.size > 0 && (mongoose.connection?.readyState === 1 || Job.find?.mock)) {
        const jobIdList = [...jobIdsToVerify];
        for (const jid of jobIdList) {
          jobMap.set(jid, null);
        }
        const jobs = await Job.find({ _id: { $in: jobIdList } })
          .select("_id status title")
          .lean();
        if (Array.isArray(jobs)) {
          for (const j of jobs) {
            jobMap.set(String(j._id), j);
          }
        }
      }
    } catch {
      // Safe fallback if model lookup fails in isolated unit tests
    }
  }

  const lang = req.user?.preferredLanguage || req.lang || "en";

  const localized = notifications.map((n) => {
    const { targetLink, targetUnavailable, jobId } = resolveNotificationTarget(
      n,
      req.user,
      appMap,
      jobMap,
      canQueryModels
    );
    const enrichedData = n.data ? { ...n.data } : {};
    if (jobId && !enrichedData.jobId) {
      enrichedData.jobId = jobId;
    }
    if (targetLink && !enrichedData.link) {
      enrichedData.link = targetLink;
    }

    return {
      _id: n._id,
      type: n.type,
      title: pickLanguage(n.title, lang, "en"),
      body: pickLanguage(n.body, lang, "en"),
      rawTitle: n.title,
      rawBody: n.body,
      channel: n.channel || "in_app",
      deliveryStatus: n.deliveryStatus || "delivered",
      isRead: Boolean(n.isRead),
      readAt: n.readAt || null,
      refId: n.refId || null,
      data: Object.keys(enrichedData).length > 0 ? enrichedData : null,
      targetLink,
      targetUnavailable,
      createdAt: n.createdAt,
    };
  });

  const totalPages = Math.ceil(total / limit) || 1;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        notifications: localized,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page < totalPages,
        },
        unreadCount,
      },
      "Notifications retrieved"
    )
  );
});

/**
 * Get unread notification count for authenticated user.
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user._id, isRead: false });
  return res.status(200).json(new ApiResponse(200, { unreadCount: count }, "Unread notification count"));
});

/**
 * Mark a single notification as read (strictly owned by user).
 */
export const markNotificationRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid notification ID format");
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    throw new ApiError(404, "Notification not found or access denied");
  }

  return res.status(200).json(new ApiResponse(200, notification, "Notification marked as read"));
});

/**
 * Mark all notifications for the authenticated user as read.
 */
export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { modifiedCount: result.modifiedCount || 0 },
      "All notifications marked as read"
    )
  );
});
