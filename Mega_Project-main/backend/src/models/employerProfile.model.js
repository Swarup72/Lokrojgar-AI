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

    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },

      coordinates: {
        type: [Number],
        required: true,
      },
    },

    ratingAvg: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    bio: {
      type: String,
      trim: true,
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