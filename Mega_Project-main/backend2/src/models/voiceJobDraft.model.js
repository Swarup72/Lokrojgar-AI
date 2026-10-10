import mongoose from "mongoose";

/**
 * A guided-voice JOB POSTING in progress.
 *
 * WHY THIS IS NOT A `VoiceProfile` ROW
 * ------------------------------------
 * VoiceProfile already models a guided session and already carries
 * `profileType: worker|employer`, so reusing it looks tempting. It cannot work:
 * its uniqueness is `{ employerId, language, mode }`, and the Guided Voice
 * EMPLOYER PROFILE occupies exactly that slot. An employer drafting a job
 * advert in Marathi would collide (E11000) with their own Marathi profile
 * draft. Widening that index would mean altering a frozen, working model that
 * a shipped feature depends on.
 *
 * The semantics differ too: a profile draft is one-per-person-per-language by
 * design, because a person has one profile. An employer may legitimately be
 * drafting several adverts. Keeping jobs here leaves the profile flow untouched
 * and lets this model carry the uniqueness rule that actually suits jobs.
 *
 * WHY THIS IS NOT A `Job` WITH status:"draft"
 * -------------------------------------------
 * Job requires title, categoryId, location.coordinates, payType, payAmount,
 * startDate and originalLanguage. A half-finished wizard has none of them yet,
 * so a partially-spoken advert could not be saved as a Job without either
 * relaxing those requirements for every job or inventing placeholder values.
 * Both are worse than a separate, deliberately permissive draft: this document
 * holds whatever has been said so far and is never itself publishable. The
 * published job is created later, by the existing POST /jobs, which validates
 * normally.
 *
 * NOTHING HERE IS PUBLIC. There is no status that makes a draft searchable,
 * and job search/recommendation query the Job collection, which this is not.
 */
const voiceJobDraftSchema = new mongoose.Schema(
  {
    // Ownership. Always resolved from req.user in the controller, never from
    // the request body, and always part of the query filter - so one employer
    // cannot read, overwrite, discard or submit another's draft.
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployerProfile",
      required: true,
      index: true,
    },

    // The language the employer SPEAKS into the wizard. It becomes the job's
    // `originalLanguage` on publish, which is what the translation service
    // translates away from.
    language: {
      type: String,
      enum: ["mr", "hi", "en"],
      required: true,
    },

    // Answers so far, keyed by wizard step. Deliberately Mixed and deliberately
    // unvalidated at this layer: a draft is allowed to be incomplete and even
    // wrong, because the employer reviews and corrects it in the Add Job form
    // before anything is published. The real constraints are enforced by the
    // Job schema and the job validators at publish time, which this cannot
    // bypass - see the "voice draft cannot bypass validation" tests.
    draftFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Which steps have been answered, so an interrupted wizard resumes where it
    // stopped instead of restarting.
    completedSteps: {
      type: [String],
      default: [],
    },

    // "draft" while the wizard is open; "consumed" once its values have been
    // handed to the Add Job form. A consumed draft is kept briefly so a
    // double-submit does not resurrect a fresh empty wizard, but it is never a
    // job and never becomes one.
    status: {
      type: String,
      enum: ["draft", "consumed"],
      default: "draft",
      required: true,
      index: true,
    },

    consumedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * One OPEN draft per employer per spoken language.
 *
 * Partial on status so that consumed drafts accumulate without blocking the
 * next one: the employer can post a second Marathi job straight after the
 * first. Without the partial filter, a finished draft would permanently
 * occupy the slot.
 */
voiceJobDraftSchema.index(
  { employerId: 1, language: 1 },
  { unique: true, partialFilterExpression: { status: "draft" } }
);

const VoiceJobDraft = mongoose.model("VoiceJobDraft", voiceJobDraftSchema);
export default VoiceJobDraft;
