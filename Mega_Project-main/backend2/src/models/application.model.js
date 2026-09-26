import mongoose from "mongoose";
import { APPLICATION_STATUS } from "../constants.js";

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
      enum: Object.values(APPLICATION_STATUS),
      default: APPLICATION_STATUS.APPLIED,
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

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    matchScore: {
      type: Number,
      min: 0,
      max: 100,
    },

    matchFactors: {
      skill: { type: Number },
      location: { type: Number },
      availability: { type: Number },
      pay: { type: Number },
      rating: { type: Number },
      relevance: { type: Number },
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: one active application per worker for a job
applicationSchema.index(
  { jobId: 1, workerId: 1 },
  { unique: true }
);

// Index on { workerId, status } for fast query filtering
applicationSchema.index({ workerId: 1, status: 1 });

const Application = mongoose.model(
  "Application",
  applicationSchema
);

export default Application;