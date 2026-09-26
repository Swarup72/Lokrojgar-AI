import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
      unique: true,
    },

    headline: {
      type: String,
      trim: true,
    },

    summary: {
      type: String,
      trim: true,
    },

    experience: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],

    education: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],

    preferredJobTypes: [
      {
        type: String,
        trim: true,
      },
    ],

    resumeUrl: {
      type: String,
      trim: true,
    },

    sourceVoiceProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VoiceProfile",
      default: null,
    },

    aiGenerated: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },

    template: {
      type: String,
      trim: true,
    },

    certifications: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],

    projects: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],

    generatedAt: {
      type: Date,
      default: null,
    },

  },
  {
    timestamps: true,
  }
);


const Resume = mongoose.model("Resume", resumeSchema);

export default Resume;