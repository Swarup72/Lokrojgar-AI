import mongoose from "mongoose";

const employerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    businessName: {
      type: String,
      required: true,
      trim: true,
    },

    businessType: {
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