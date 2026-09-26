import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    otpHash: {
      type: String,
      required: true,
    },

    purpose: {
      type: String,
      enum: ["login", "register", "password_reset", "verify_phone"],
      default: "login",
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically remove expired OTP records
otpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// Compound index for fast phone & purpose lookup
otpSchema.index({ phone: 1, purpose: 1 });

const OTP = mongoose.model("OTP", otpSchema);

export default OTP;
