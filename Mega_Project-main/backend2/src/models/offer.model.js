import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployerProfile",
      required: true,
      index: true,
    },

    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
      index: true,
    },

    proposedPay: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["sent", "accepted", "rejected", "expired"],
      default: "sent",
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique index for active "sent" offers per worker and job, allowing re-offering after expiration/rejection
offerSchema.index(
  { jobId: 1, workerId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "sent" },
  }
);

// Index on { workerId, status } for fast worker query filtering
offerSchema.index({ workerId: 1, status: 1 });

const Offer = mongoose.model("Offer", offerSchema);

export default Offer;