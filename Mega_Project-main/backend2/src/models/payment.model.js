import mongoose from "mongoose";
import { PAYMENT_STATUS } from "../constants.js";

const paymentSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      default: null,
      index: true,
    },

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      default: null,
      index: true,
    },

    payerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    payeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "online"],
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      required: true,
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    note: {
      type: String,
      trim: true,
      default: null,
    },

    gateway: {
      type: String,
      enum: ["razorpay", "other"],
      default: null,
    },

    gatewayTransactionId: {
      type: String,
      trim: true,
      default: null,
    },

    gatewayOrderId: {
      type: String,
      trim: true,
      default: null,
    },

    gatewaySignature: {
      type: String,
      trim: true,
      default: null,
    },

    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique sparse index on gatewayOrderId
paymentSchema.index(
  { gatewayOrderId: 1 },
  {
    unique: true,
    sparse: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;