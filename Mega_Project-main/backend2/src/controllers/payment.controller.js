import Payment from "../models/payment.model.js";
import Job from "../models/job.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createRazorpayOrder, verifyRazorpaySignature } from "../services/payment.service.js";
import { PAYMENT_STATUS } from "../constants.js";
import { sendNotificationService } from "../services/notification.service.js";

export const recordCashOrUPI = asyncHandler(async (req, res) => {
  const { jobId, shiftId, applicationId, payeeId, amount, paymentMethod, note } = req.body;

  if (!["cash", "upi"].includes(paymentMethod)) {
    throw new ApiError(400, "Payment method must be cash or upi for manual recording");
  }

  const payment = await Payment.create({
    jobId,
    shiftId,
    applicationId,
    payerId: req.user._id,
    payeeId,
    amount,
    paymentMethod,
    status: PAYMENT_STATUS.PAID,
    paidAt: new Date(),
    note,
  });

  await sendNotificationService({
    userId: payeeId,
    type: "PAYMENT_RECEIVED",
    templateKey: "PAYMENT_RECEIVED",
    templateData: { amount },
    refId: payment._id,
  });

  return res.status(201).json(new ApiResponse(201, payment, "Cash/UPI payment recorded successfully"));
});

export const createRazorpayOrderEndpoint = asyncHandler(async (req, res) => {
  const { jobId, shiftId, applicationId, payeeId, amount } = req.body;

  const receiptId = `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const order = await createRazorpayOrder(amount, receiptId);

  const payment = await Payment.create({
    jobId,
    shiftId,
    applicationId,
    payerId: req.user._id,
    payeeId,
    amount,
    paymentMethod: "online",
    gateway: "razorpay",
    gatewayOrderId: order.id,
    status: PAYMENT_STATUS.PENDING,
  });

  return res.status(201).json(new ApiResponse(201, { order, paymentId: payment._id }, "Razorpay order created"));
});

export const verifyRazorpayPaymentEndpoint = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

  const isValid = verifyRazorpaySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  );

  if (!isValid) {
    await Payment.findByIdAndUpdate(paymentId, { status: PAYMENT_STATUS.FAILED });
    throw new ApiError(400, "Invalid Razorpay payment signature");
  }

  const payment = await Payment.findByIdAndUpdate(
    paymentId,
    {
      gatewayTransactionId: razorpay_payment_id,
      gatewaySignature: razorpay_signature,
      status: PAYMENT_STATUS.PAID,
      paidAt: new Date(),
    },
    { new: true }
  );

  if (payment) {
    await sendNotificationService({
      userId: payment.payeeId,
      type: "PAYMENT_RECEIVED",
      templateKey: "PAYMENT_RECEIVED",
      templateData: { amount: payment.amount },
      refId: payment._id,
    });
  }

  return res.status(200).json(new ApiResponse(200, payment, "Payment verified successfully"));
});

export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const event = req.body;
  if (event.event === "payment.captured") {
    const paymentEntity = event.payload.payment.entity;
    await Payment.findOneAndUpdate(
      { gatewayOrderId: paymentEntity.order_id },
      {
        gatewayTransactionId: paymentEntity.id,
        status: PAYMENT_STATUS.PAID,
        paidAt: new Date(),
        gatewayResponse: paymentEntity,
      }
    );
  }
  return res.status(200).json({ status: "ok" });
});

export const markPaymentPaid = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const payment = await Payment.findByIdAndUpdate(
    paymentId,
    { status: PAYMENT_STATUS.PAID, paidAt: new Date() },
    { new: true }
  );
  return res.status(200).json(new ApiResponse(200, payment, "Payment marked as completed"));
});

export const getPaymentHistory = asyncHandler(async (req, res) => {
  const payments = await Payment.find({
    $or: [{ payerId: req.user._id }, { payeeId: req.user._id }],
  })
    .populate("jobId payerId payeeId")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, payments, "Payment history retrieved"));
});

export const processRefund = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const payment = await Payment.findByIdAndUpdate(
    paymentId,
    { status: PAYMENT_STATUS.REFUNDED },
    { new: true }
  );
  return res.status(200).json(new ApiResponse(200, payment, "Payment refunded"));
});
