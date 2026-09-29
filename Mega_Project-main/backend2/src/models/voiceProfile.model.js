import mongoose from "mongoose";

const voiceProfileSchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
    },

    language: {
      type: String,
      enum: ["mr", "hi", "en"],
      required: true,
    },

    // Backblaze B2 object key (private bucket), not a URL - confirmed via
    // repo-wide search that no other backend or frontend code reads this
    // field, so this rename is safe. Generate a short-lived signed URL via
    // getSignedAudioUrl() if playback is ever needed.
    audioKey: {
      type: String,
      required: true,
      trim: true,
    },

    transcript: {
      type: String,
      trim: true,
    },

    extractedFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: true,
  }
);

// One voice profile per worker for each language
voiceProfileSchema.index(
  { workerId: 1, language: 1 },
  { unique: true }
);

const VoiceProfile = mongoose.model(
  "VoiceProfile",
  voiceProfileSchema
);

export default VoiceProfile;