import mongoose from "mongoose";
import { PREFERRED_LANGUAGES } from "../constants.js";

const jobSchema = new mongoose.Schema(
  {
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployerProfile",
      required: true,
      index: true,
    },

    title: {
      type: {
        mr: { type: String, trim: true, default: null },
        hi: { type: String, trim: true, default: null },
        en: { type: String, trim: true, default: null },
      },
      required: true,
      validate: {
        validator: function (v) {
          return !!(v && (v.mr?.trim() || v.hi?.trim() || v.en?.trim()));
        },
        message: "Job title must be provided in at least one language (mr, hi, or en).",
      },
    },

    description: {
      mr: { type: String, trim: true, default: null },
      hi: { type: String, trim: true, default: null },
      en: { type: String, trim: true, default: null },
    },

    skillIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Skill",
      },
    ],

    city: {
      type: String,
      trim: true,
      default: null,
    },

    address: {
      type: String,
      trim: true,
      default: null,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },

      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: function (val) {
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
          message: "Coordinates must be [longitude, latitude] with longitude in [-180, 180] and latitude in [-90, 90].",
        },
      },
    },

    payType: {
      type: String,
      enum: ["daily", "monthly", "fixed"],
      required: true,
    },

    payAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    requiredWorkers: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    filledWorkers: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "draft",
        "open",
        "partially_assigned",
        "assigned",
        "completed",
        "cancelled",
        "expired",
      ],
      default: "open",
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCategory",
      required: true,
      index: true,
    },

    originalLanguage: {
      type: String,
      enum: PREFERRED_LANGUAGES,
      required: true,
    },

    experienceRequired: {
      type: Number,
      min: 0,
      default: 0,
    },

    preferredLanguages: [
      {
        type: String,
        enum: PREFERRED_LANGUAGES,
        trim: true,
      },
    ],

    applicationDeadline: {
      type: Date,
    },

    startTime: {
      type: String,
      default: null,
    },

    endTime: {
      type: String,
      default: null,
    },

    shiftType: {
      type: String,
      enum: ["day", "night", "flexible"],
      default: "flexible",
    },
  },
  {
    timestamps: true,
  }
);

// GeoJSON 2dsphere index
jobSchema.index({
  location: "2dsphere",
});

// Compound index: status + createdAt
jobSchema.index({
  status: 1,
  createdAt: -1,
});

const Job = mongoose.model("Job", jobSchema);
export default Job;