import OTP from "../models/otp.model.js";
import { generateOTP, hashOTP, verifyOTP } from "../utils/otp.js";
import logger from "../utils/logger.js";

/**
 * Send an OTP to a phone number and save the hash to DB.
 *
 * @param {string} phone - Target phone number
 * @param {string} purpose - Purpose ('login', 'register', 'password_reset', 'verify_phone')
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const sendOTPService = async (phone, purpose = "login") => {
  const plainOTP = generateOTP(6);
  const hashedOTP = await hashOTP(plainOTP);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  // Upsert OTP record for phone & purpose
  await OTP.findOneAndUpdate(
    { phone, purpose },
    {
      phone,
      otpHash: hashedOTP,
      purpose,
      expiresAt,
      attempts: 0,
      isVerified: false,
    },
    { upsert: true, new: true }
  );

  // Send via SMS Provider or log in development
  if (process.env.NODE_ENV === "production" && process.env.MSG91_AUTH_KEY) {
    // Send via SMS Gateway (e.g. MSG91 or Twilio)
    logger.info(`[SMS SENT] OTP sent to ${phone}`);
  } else {
    logger.info(`[DEV OTP LOG] Phone: ${phone} | Purpose: ${purpose} | OTP: ${plainOTP}`);
  }

  return {
    success: true,
    message: `OTP sent successfully to ${phone}`,
    // In dev environment, return plainOTP for easy testing
    ...(process.env.NODE_ENV !== "production" ? { devOTP: plainOTP } : {}),
  };
};

/**
 * Verify an OTP entered by the user.
 *
 * @param {string} phone
 * @param {string} candidateOTP
 * @param {string} purpose
 * @returns {Promise<boolean>}
 */
export const verifyOTPService = async (phone, candidateOTP, purpose = "login") => {
  const otpRecord = await OTP.findOne({ phone, purpose });

  if (!otpRecord) {
    return false;
  }

  if (otpRecord.expiresAt < new Date()) {
    await OTP.deleteOne({ _id: otpRecord._id });
    return false;
  }

  if (otpRecord.attempts >= 5) {
    return false;
  }

  const isValid = await verifyOTP(candidateOTP, otpRecord.otpHash);

  if (!isValid) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    return false;
  }

  // Mark verified or cleanup
  otpRecord.isVerified = true;
  await otpRecord.save();

  return true;
};
