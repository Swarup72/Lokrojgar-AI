import mongoose from "mongoose";

const shiftSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },

    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
    },

    shiftDate: {
      type: Date,
      required: true,
    },

    startTime: {
      type: String,
      required: true,
      trim: true,
    },

    endTime: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "scheduled",
        "completed",
        "missed",
        "cancelled",
      ],
      default: "scheduled",
      required: true,
    },

    checkInAt: {
      type: Date,
    },

    checkOutAt: {
      type: Date,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

const Shift = mongoose.model("Shift", shiftSchema);

export default Shift;