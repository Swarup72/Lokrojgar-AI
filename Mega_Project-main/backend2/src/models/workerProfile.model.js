import mongoose from "mongoose";
import { PREFERRED_LANGUAGES } from "../constants.js";

const workerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    profilePhoto: {
      type: String,
      default: null,
      trim: true,
    },

    bio: {
      mr: { type: String, trim: true, maxlength: 1000 },
      hi: { type: String, trim: true, maxlength: 1000 },
      en: { type: String, trim: true, maxlength: 1000 },
    },

    city: {
      type: String,
      trim: true,
      default: null,
    },

    village: {
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

    availability: {
      type: String,
      enum: ["available", "busy", "unavailable"],
      default: "available",
    },

    expectedPay: {
      type: Number,
      min: 0,
    },

    ratingAvg: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    languages: {
      type: [String],
      enum: PREFERRED_LANGUAGES,
      default: ["mr"],
    },

    preferredJobCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JobCategory",
      },
    ],

    preferredWorkRadiusKm: {
      type: Number,
      default: 20,
      min: 1,
    },

    experienceYears: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// GeoJSON 2dsphere index for location matching
workerProfileSchema.index({
  location: "2dsphere",
});

const WorkerProfile = mongoose.model(
  "WorkerProfile",
  workerProfileSchema
);

export default WorkerProfile;