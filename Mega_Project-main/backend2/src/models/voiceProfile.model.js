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

    // LEGACY. Voice recordings are a processing artifact now: they are
    // transcribed and deleted, never uploaded to permanent storage, so new
    // documents do not set this. The field is kept (and only kept) because
    // existing documents still carry the B2 object key of audio uploaded
    // under the old behaviour - it is the only record of which stored
    // objects are still referenced, which the cleanup of that old audio
    // depends on. No code reads it; do not start writing it again.
    audioKey: {
      type: String,
      required: false,
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