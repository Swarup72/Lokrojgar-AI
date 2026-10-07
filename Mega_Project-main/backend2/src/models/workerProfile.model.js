import mongoose from "mongoose";
import { PREFERRED_LANGUAGES } from "../constants.js";
import { optionalGeoPoint } from "./geoPoint.schema.js";

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

    // OPTIONAL, with no default - see models/geoPoint.schema.js for why a
    // placeholder location is worse than no location at all.
    location: optionalGeoPoint(),

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