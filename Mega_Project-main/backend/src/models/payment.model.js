import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
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
      enum: ["pending", "processing", "paid", "failed", "refunded"],
      default: "pending",
      required: true,
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

    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;