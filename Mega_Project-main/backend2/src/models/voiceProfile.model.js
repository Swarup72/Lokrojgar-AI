import mongoose from "mongoose";

const voiceProfileSchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      default: null,
    },

    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployerProfile",
      default: null,
    },

    // "worker" | "employer"
    profileType: {
      type: String,
      enum: ["worker", "employer"],
      default: "worker",
      required: true,
      index: true,
    },

    language: {
      type: String,
      enum: ["mr", "hi", "en"],
      required: true,
    },

    // Which capture flow produced this document.
    //
    // "quick"  - the original single-recording flow: one recording, one
    //            extraction, one review.
    // "guided" - the field-by-field flow: one short recording per question,
    //            accumulated in `draftFields` until the user confirms.
    //
    // Defaults to "quick" so the 12 documents that existed before this field
    // read correctly without being rewritten. The unique index below includes
    // `mode`, which is what lets a user hold a guided draft and a quick
    // extraction in the same language at once instead of one silently
    // overwriting the other.
    mode: {
      type: String,
      enum: ["quick", "guided"],
      default: "quick",
      required: true,
      index: true,
    },

    // A guided session's answers so far, keyed by profile field name.
    // This is a DRAFT: nothing here reaches the canonical profile until
    // the user confirms, so an abandoned wizard cannot half-overwrite a good profile.
    draftFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Which steps the user has answered, so the wizard can be resumed where
    // they left off rather than restarted.
    completedSteps: {
      type: [String],
      default: [],
    },

    // "draft" until the user confirms, then "committed". A committed document
    // is kept as the record of what was applied; it is not a second profile.
    status: {
      type: String,
      enum: ["draft", "committed"],
      default: "committed",
      required: true,
    },

    committedAt: {
      type: Date,
      default: null,
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

// One voice profile per worker/employer, per language, PER MODE.
voiceProfileSchema.index(
  { workerId: 1, language: 1, mode: 1 },
  { unique: true, partialFilterExpression: { workerId: { $type: "objectId" } } }
);

voiceProfileSchema.index(
  { employerId: 1, language: 1, mode: 1 },
  { unique: true, partialFilterExpression: { employerId: { $type: "objectId" } } }
);

const VoiceProfile = mongoose.model(
  "VoiceProfile",
  voiceProfileSchema
);

export default VoiceProfile;