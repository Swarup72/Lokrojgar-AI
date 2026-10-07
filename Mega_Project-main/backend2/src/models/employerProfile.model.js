import mongoose from "mongoose";
import { optionalGeoPoint } from "./geoPoint.schema.js";

const employerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Optional by product decision: an employer may hire under their own
    // personal name (User.fullName). Code that displays an employer must go
    // through employerDisplayName() in utils/displayName.js rather than
    // reading this field directly, so a nameless business never renders as
    // blank or as an invented placeholder.
    businessName: {
      type: String,
      default: null,
      trim: true,
    },

    businessType: {
      type: String,
      default: null,
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

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// GeoJSON 2dsphere index
employerProfileSchema.index({
  location: "2dsphere",
});

const EmployerProfile = mongoose.model(
  "EmployerProfile",
  employerProfileSchema
);

export default EmployerProfile;