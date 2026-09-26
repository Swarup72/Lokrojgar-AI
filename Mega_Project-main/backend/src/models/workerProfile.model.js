import mongoose from "mongoose";

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

    bio: {
      mr: { type: String, trim: true, maxlength: 1000 },
      hi: { type: String, trim: true, maxlength: 1000 },
      en: { type: String, trim: true, maxlength: 1000 },
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

    languages: {
      type: [String],
      enum: ["mr", "hi", "en"],
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

// Required for nearby-worker/job matching
workerProfileSchema.index({
  location: "2dsphere",
});

const WorkerProfile = mongoose.model(
  "WorkerProfile",
  workerProfileSchema
);

export default WorkerProfile;



/*
{
  userId: "68b6f2c8a1234567890abcd",
  fullName: "Ramesh Patil",
  bio: "Experienced electrician with 6 years of experience in residential and commercial electrical work.",

  location: {
    type: "Point",
    coordinates: [74.5815, 16.8524]
  },

  availability: "available",

  expectedPay: 800,

  ratingAvg: 4.5,

  languages: ["mr", "hi", "en"],

  preferredJobCategories: [
    "68b6f31aa1234567890abcde"
  ],

  preferredWorkRadiusKm: 25,

  experienceYears: 6
} */