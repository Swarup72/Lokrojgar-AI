import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },

    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployerProfile",
      required: true,
    },

    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
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
    },
  },
  {
    timestamps: true,
  }
);

offerSchema.index(
  {jobId: 1, workerId: 1,},
  { unique: true }
);

const Offer = mongoose.model("Offer", offerSchema);

export default Offer;