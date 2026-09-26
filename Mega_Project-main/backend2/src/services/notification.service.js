import Notification from "../models/notification.model.js";
import DeviceToken from "../models/deviceToken.model.js";
import { firebaseMessaging } from "../config/firebase.config.js";
import { buildTrilingualNotification } from "../utils/notificationBuilder.js";
import logger from "../utils/logger.js";

/**
 * Send notification to user: creates DB notification record and dispatches FCM push notification.
 *
 * @param {Object} params
 * @param {string} params.userId - Recipient user ID
 * @param {string} params.type - Notification type
 * @param {string} params.templateKey - Template key for trilingual builder
 * @param {Object} [params.templateData] - Context data for template
 * @param {string} [params.refId] - Associated entity ID
 * @param {Object} [params.customTitle] - Optional custom trilingual title
 * @param {Object} [params.customBody] - Optional custom trilingual body
 */
export const sendNotificationService = async ({
  userId,
  type,
  templateKey,
  templateData = {},
  refId = null,
  customTitle = null,
  customBody = null,
}) => {
  try {
    const { title, body } = buildTrilingualNotification(
      templateKey,
      templateData,
      customTitle,
      customBody
    );

    // 1. Create DB Notification
    const notification = await Notification.create({
      userId,
      type,
      title,
      body,
      refId,
      data: templateData,
    });

    // 2. Dispatch FCM Push Notifications if device tokens exist
    const deviceTokens = await DeviceToken.find({ userId, isActive: true });

    if (deviceTokens.length > 0 && firebaseMessaging) {
      const tokens = deviceTokens.map((t) => t.token);

      const messagePayload = {
        notification: {
          title: title.en || title.hi || title.mr || "Notification",
          body: body.en || body.hi || body.mr || "",
        },
        data: {
          notificationId: notification._id.toString(),
          type: type,
          refId: refId ? refId.toString() : "",
        },
      };

      await firebaseMessaging.sendEachForMulticast({
        tokens,
        ...messagePayload,
      });
      logger.info(`[FCM SENT] Dispatched push notification to ${tokens.length} devices for user ${userId}`);
    }

    return notification;
  } catch (error) {
    logger.error(`Notification Dispatch Error for user ${userId}:`, error);
  }
};
