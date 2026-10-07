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

    // Which capture flow produced this document.
    //
    // "quick"  - the original single-recording flow: one recording, one
    //            extraction, one review.
    // "guided" - the field-by-field flow: one short recording per question,
    //            accumulated in `draftFields` until the worker confirms.
    //
    // Defaults to "quick" so the 12 documents that existed before this field
    // read correctly without being rewritten. The unique index below includes
    // `mode`, which is what lets a worker hold a guided draft and a quick
    // extraction in the same language at once instead of one silently
    // overwriting the other.
    mode: {
      type: String,
      enum: ["quick", "guided"],
      default: "quick",
      required: true,
      index: true,
    },

    // A guided session's answers so far, keyed by WorkerProfile field name
    // (fullName, expectedPay, experienceYears, skills, city, languages,
    // availability). This is a DRAFT: nothing here reaches the canonical
    // WorkerProfile until the worker confirms, so an abandoned wizard cannot
    // half-overwrite a good profile.
    draftFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Which steps the worker has answered, so the wizard can be resumed where
    // they left off rather than restarted.
    completedSteps: {
      type: [String],
      default: [],
    },

    // "draft" until the worker confirms, then "committed". A committed document
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

// One voice profile per worker, per language, PER MODE.
//
// `mode` was added to this key because the two flows would otherwise collide:
// the quick flow upserts on { workerId, language }, so starting a guided draft
// in a language the worker had already used would have overwritten their quick
// extraction (and vice versa). Existing documents were backfilled with
// mode: "quick" by scripts/backfill-voiceprofile-mode.mjs so none of them
// changes meaning under the new key.
voiceProfileSchema.index(
  { workerId: 1, language: 1, mode: 1 },
  { unique: true }
);

const VoiceProfile = mongoose.model(
  "VoiceProfile",
  voiceProfileSchema
);

export default VoiceProfile;