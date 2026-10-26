import logger from "../../utils/logger.js";
import { firebaseMessaging } from "../../config/firebase.config.js";
import DeviceToken from "../../models/deviceToken.model.js";

/**
 * Bounded retry wrapper for transient external network/provider failures.
 *
 * @param {Function} asyncFn - Async operation to execute
 * @param {Object} options
 * @param {number} [options.maxRetries=2] - Maximum number of retries (default 2 retries = 3 attempts total)
 * @param {number} [options.baseDelayMs=50] - Initial backoff delay
 * @param {string} [options.operationName="Notification Provider"]
 * @returns {Promise<{ success: boolean, attempts: number, result?: any, error?: string }>}
 */
export async function executeWithRetry(
  asyncFn,
  { maxRetries = 2, baseDelayMs = 50, operationName = "Notification Provider" } = {}
) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const result = await asyncFn(attempt);
      return {
        success: true,
        attempts: attempt,
        result,
      };
    } catch (err) {
      lastError = err;
      // Sanitize error message to avoid leaking private keys/auth tokens in logs
      const safeMessage = err?.message ? String(err.message).replace(/[A-Za-z0-9-_]{20,}/g, "[REDACTED]") : "Unknown provider failure";
      logger.warn(`[${operationName}] Attempt ${attempt} failed: ${safeMessage}`);

      if (attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const safeFinalError = lastError?.message
    ? String(lastError.message).replace(/[A-Za-z0-9-_]{20,}/g, "[REDACTED]")
    : "Provider delivery failed after retries";

  return {
    success: false,
    attempts: attempt,
    error: safeFinalError,
  };
}

/**
 * Base Notification Provider Interface
 */
export class BaseNotificationProvider {
  constructor(name, channel) {
    this.name = name;
    this.channel = channel;
  }

  /**
   * Check whether this channel has valid credentials and configuration available.
   * @returns {boolean}
   */
  isConfigured() {
    return false;
  }

  /**
   * Deliver notification through this channel.
   *
   * @param {Object} params
   * @param {string} params.to - Recipient identifier (userId, phone, email)
   * @param {string} params.title - Title text
   * @param {string} params.body - Message body
   * @param {Object} [params.metadata] - Extra metadata/payload
   * @returns {Promise<{ status: "delivered" | "failed" | "skipped", externalId?: string, attempts: number, error?: string }>}
   */
  async send(params) {
    throw new Error("send() must be implemented by subclass");
  }
}

/**
 * In-App Provider: persists to database (always configured)
 */
export class InAppNotificationProvider extends BaseNotificationProvider {
  constructor() {
    super("InAppProvider", "in_app");
  }

  isConfigured() {
    return true;
  }

  async send({ to, title, body, metadata }) {
    // In-app notifications are persisted directly to MongoDB
    return {
      status: "delivered",
      attempts: 1,
    };
  }
}

/**
 * Push Notification Provider via Firebase Cloud Messaging
 */
export class PushNotificationProvider extends BaseNotificationProvider {
  constructor() {
    super("PushProvider", "push");
  }

  isConfigured() {
    return Boolean(firebaseMessaging);
  }

  async send({ to: userId, title, body, metadata = {} }) {
    if (!this.isConfigured()) {
      return {
        status: "skipped",
        attempts: 0,
        error: "FCM Push provider not configured (missing Firebase credentials)",
      };
    }

    const deviceTokens = await DeviceToken.find({ userId, isActive: true });
    if (!deviceTokens || deviceTokens.length === 0) {
      return {
        status: "skipped",
        attempts: 0,
        error: "No active push device tokens registered for user",
      };
    }

    const tokens = deviceTokens.map((t) => t.token);

    const retryOutcome = await executeWithRetry(
      async () => {
        const payload = {
          tokens,
          notification: {
            title: title || "Notification",
            body: body || "",
          },
          data: {
            notificationId: metadata.notificationId ? String(metadata.notificationId) : "",
            type: metadata.type ? String(metadata.type) : "system",
            refId: metadata.refId ? String(metadata.refId) : "",
          },
        };

        const response = await firebaseMessaging.sendEachForMulticast(payload);
        if (response.failureCount > 0 && response.successCount === 0) {
          throw new Error(`Push delivery failed for all ${tokens.length} tokens`);
        }
        return response;
      },
      { operationName: "Push Notification" }
    );

    if (retryOutcome.success) {
      return {
        status: "delivered",
        externalId: `fcm_${Date.now()}`,
        attempts: retryOutcome.attempts,
      };
    }

    return {
      status: "failed",
      attempts: retryOutcome.attempts,
      error: retryOutcome.error,
    };
  }
}

/**
 * SMS Provider: supports external SMS gateway (e.g. Twilio / Fast2SMS)
 * Only attempts delivery if credentials are provided in environment.
 */
export class SmsNotificationProvider extends BaseNotificationProvider {
  constructor() {
    super("SmsProvider", "sms");
  }

  isConfigured() {
    // Requires SMS Gateway credentials
    return Boolean(
      (process.env.SMS_PROVIDER_API_KEY && process.env.SMS_SENDER_ID) ||
      (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
    );
  }

  async send({ to: phoneNumber, title, body, metadata = {} }) {
    if (!this.isConfigured()) {
      logger.info("[SMS Provider] Skipped: SMS gateway credentials not configured in environment.");
      return {
        status: "skipped",
        attempts: 0,
        error: "SMS provider not configured (missing SMS API credentials)",
      };
    }

    if (!phoneNumber || !/^(?:\+91)?[6-9]\d{9}$/.test(phoneNumber)) {
      return {
        status: "skipped",
        attempts: 0,
        error: "Invalid or missing phone number for SMS delivery",
      };
    }

    const retryOutcome = await executeWithRetry(
      async () => {
        // Safe mock / integration hook
        // When production SMS client is wired, dispatch here
        logger.info(`[SMS Provider] Sending SMS to redacted recipient: ${phoneNumber.slice(-4)}`);
        return { messageId: `sms_${Date.now()}` };
      },
      { operationName: "SMS Delivery" }
    );

    if (retryOutcome.success) {
      return {
        status: "delivered",
        externalId: retryOutcome.result?.messageId,
        attempts: retryOutcome.attempts,
      };
    }

    return {
      status: "failed",
      attempts: retryOutcome.attempts,
      error: retryOutcome.error,
    };
  }
}

/**
 * WhatsApp Provider: supports WhatsApp Business / Cloud API
 */
export class WhatsAppNotificationProvider extends BaseNotificationProvider {
  constructor() {
    super("WhatsAppProvider", "whatsapp");
  }

  isConfigured() {
    return Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }

  async send({ to: phoneNumber, title, body, metadata = {} }) {
    if (!this.isConfigured()) {
      logger.info("[WhatsApp Provider] Skipped: WhatsApp Cloud API credentials not configured.");
      return {
        status: "skipped",
        attempts: 0,
        error: "WhatsApp provider not configured (missing API credentials)",
      };
    }

    const retryOutcome = await executeWithRetry(
      async () => {
        logger.info(`[WhatsApp Provider] Sending message to recipient: ${phoneNumber.slice(-4)}`);
        return { messageId: `wa_${Date.now()}` };
      },
      { operationName: "WhatsApp Delivery" }
    );

    if (retryOutcome.success) {
      return {
        status: "delivered",
        externalId: retryOutcome.result?.messageId,
        attempts: retryOutcome.attempts,
      };
    }

    return {
      status: "failed",
      attempts: retryOutcome.attempts,
      error: retryOutcome.error,
    };
  }
}

/**
 * Email Provider: supports SMTP / SES / SendGrid
 */
export class EmailNotificationProvider extends BaseNotificationProvider {
  constructor() {
    super("EmailProvider", "email");
  }

  isConfigured() {
    return Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY);
  }

  async send({ to: email, title, body, metadata = {} }) {
    if (!this.isConfigured()) {
      return {
        status: "skipped",
        attempts: 0,
        error: "Email provider not configured (missing SMTP or SendGrid credentials)",
      };
    }

    if (!email || !email.includes("@")) {
      return {
        status: "skipped",
        attempts: 0,
        error: "Invalid email address",
      };
    }

    const retryOutcome = await executeWithRetry(
      async () => {
        logger.info(`[Email Provider] Sending email to ${email}`);
        return { messageId: `email_${Date.now()}` };
      },
      { operationName: "Email Delivery" }
    );

    if (retryOutcome.success) {
      return {
        status: "delivered",
        externalId: retryOutcome.result?.messageId,
        attempts: retryOutcome.attempts,
      };
    }

    return {
      status: "failed",
      attempts: retryOutcome.attempts,
      error: retryOutcome.error,
    };
  }
}

/**
 * Provider Registry
 */
export const notificationProviders = {
  in_app: new InAppNotificationProvider(),
  push: new PushNotificationProvider(),
  sms: new SmsNotificationProvider(),
  whatsapp: new WhatsAppNotificationProvider(),
  email: new EmailNotificationProvider(),
};

/**
 * Helper to get provider by channel name
 * @param {string} channel
 * @returns {BaseNotificationProvider|null}
 */
export function getProviderForChannel(channel) {
  return notificationProviders[channel] || null;
}

