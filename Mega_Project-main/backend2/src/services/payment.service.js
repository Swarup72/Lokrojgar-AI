import crypto from "crypto";
import { razorpayInstance } from "../config/razorpay.config.js";

/**
 * Create Razorpay Order
 *
 * @param {number} amount - Amount in INR
 * @param {string} receiptId - Unique internal receipt/job ID
 * @returns {Promise<Object>} Razorpay order object
 */
export const createRazorpayOrder = async (amount, receiptId) => {
  if (!razorpayInstance) {
    // Return mock order if Razorpay credentials not configured
    return {
      id: `order_mock_${Date.now()}`,
      entity: "order",
      amount: amount * 100,
      amount_paid: 0,
      amount_due: amount * 100,
      currency: "INR",
      receipt: receiptId,
      status: "created",
    };
  }

  const options = {
    amount: Math.round(amount * 100), // Amount in paise
    currency: "INR",
    receipt: receiptId,
  };

  return await razorpayInstance.orders.create(options);
};

/**
 * Verify Razorpay Payment Signature
 *
 * @param {string} orderId
 * @param {string} paymentId
 * @param {string} signature
 * @returns {boolean} True if signature is valid
 */
export const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    // Dev mock fallback
    return true;
  }

  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return generatedSignature === signature;
};
