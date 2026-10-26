import mongoose from "mongoose";
import Notification from "../models/notification.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pickLanguage } from "../utils/languagePicker.js";

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

  const lang = req.user?.preferredLanguage || req.lang || "en";

  const localized = notifications.map((n) => ({
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
    data: n.data || null,
    createdAt: n.createdAt,
  }));

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
