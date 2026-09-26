import mongoose from "mongoose";

const shiftSchema = new mongoose.Schema(
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

    shiftDate: {
      type: Date,
      required: true,
      index: true,
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
      enum: ["scheduled", "completed", "missed", "cancelled"],
      default: "scheduled",
      required: true,
      index: true,
    },

    checkInAt: {
      type: Date,
      default: null,
    },

    checkOutAt: {
      type: Date,
      default: null,
    },

    checkInLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: function (val) {
            if (!val || val.length === 0) return true; // Optional if not checked in yet
            if (!Array.isArray(val) || val.length !== 2) return false;
            const [lng, lat] = val;
            return (
              typeof lng === "number" &&
              typeof lat === "number" &&
              lng >= -180 &&
              lng <= 180 &&
              lat >= -90 &&
              lat <= 90
            );
          },
          message: "Check-in coordinates must be [longitude, latitude] with longitude in [-180, 180] and latitude in [-90, 90].",
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying shifts by job and worker
shiftSchema.index({ jobId: 1, workerId: 1 });
shiftSchema.index({ workerId: 1, shiftDate: 1 });

const Shift = mongoose.model("Shift", shiftSchema);

export default Shift;