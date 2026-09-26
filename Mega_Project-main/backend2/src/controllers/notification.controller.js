import Notification from "../models/notification.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pickLanguage } from "../utils/languagePicker.js";

export const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
  const lang = req.lang || "en";

  const localized = notifications.map((n) => ({
    _id: n._id,
    type: n.type,
    title: pickLanguage(n.title, lang),
    body: pickLanguage(n.body, lang),
    isRead: n.isRead,
    refId: n.refId,
    createdAt: n.createdAt,
  }));

  return res.status(200).json(new ApiResponse(200, localized, "Notifications retrieved"));
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user._id, isRead: false });
  return res.status(200).json(new ApiResponse(200, { unreadCount: count }, "Unread notification count"));
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, notification, "Notification marked as read"));
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return res.status(200).json(new ApiResponse(200, {}, "All notifications marked as read"));
});
