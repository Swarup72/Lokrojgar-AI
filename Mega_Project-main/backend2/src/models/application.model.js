import mongoose from "mongoose";
import { APPLICATION_STATUS, APPLICATION_INITIATORS } from "../constants.js";

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

    // Which side started this hiring relationship. A worker applying and an
    // employer sending a job request produce the SAME kind of document - this
    // records which, so the UI can say "you applied" vs "you were invited" and
    // so the lifecycle can require the right party to respond.
    //
    // Defaults to "worker": every Application that existed before this field
    // was added was created by a worker applying, so the default is the
    // historically correct value and no migration is required.
    initiatedBy: {
      type: String,
      enum: Object.values(APPLICATION_INITIATORS),
      default: APPLICATION_INITIATORS.WORKER,
      required: true,
      index: true,
    },

    // When the worker answered an employer-initiated invitation.
    respondedAt: {
      type: Date,
      default: null,
    },

    proposedPay: {
      type: Number,
      min: 0,
    },

    coverNote: {
      type: String,
      trim: true,
      default: "",
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