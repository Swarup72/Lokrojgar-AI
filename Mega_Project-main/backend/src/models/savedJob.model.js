import mongoose from "mongoose";

const savedJobSchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
    },

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },

    savedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

// Prevent the same worker from saving the same job more than once
savedJobSchema.index(
  { workerId: 1, jobId: 1 },
  { unique: true }
);

const SavedJob = mongoose.model("SavedJob", savedJobSchema);

export default SavedJob;