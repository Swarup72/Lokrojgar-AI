import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "applied",
        "shortlisted",
        "accepted",
        "rejected",
        "completed",
        "withdrawn",
      ],
      default: "applied",
      required: true,
    },

    proposedPay: {
      type: Number,
      min: 0,
    },

    appliedAt: {
      type: Date,
      default: Date.now,
    },

    matchScore: {
      type: Number,
      min: 0,
      max: 100,
    },

    matchFactors: {
      skill: {
        type: Number,
      },

      location: {
        type: Number,
      },

      availability: {
        type: Number,
      },

      pay: {
        type: Number,
      },

      rating: {
        type: Number,
      },

      relevance: {
        type: Number,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: one application per worker for a job
applicationSchema.index(
  { jobId: 1, workerId: 1 },
  { unique: true }
);

const Application = mongoose.model(
  "Application",
  applicationSchema
);

export default Application;