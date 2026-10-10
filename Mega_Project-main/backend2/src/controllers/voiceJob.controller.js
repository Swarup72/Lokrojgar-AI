import fs from "fs";
import VoiceJobDraft from "../models/voiceJobDraft.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { processVoiceFieldAudio, AiServiceUnavailableError } from "../services/ai.service.js";
import { resolveSkillsFromText, resolveJobCategoriesFromText } from "../utils/skillNormalization.js";
import logger from "../utils/logger.js";

/**
 * Guided voice JOB POSTING — the employer-side wizard.
 *
 * This produces a DRAFT and nothing else. It has no publish path: the reviewed
 * values are handed back to the existing Add Job form and published by the
 * existing POST /jobs, which validates and translates exactly as it does for a
 * manually typed advert. There is deliberately no endpoint here that can
 * create a Job, so a voice draft cannot bypass job validation or go live
 * without the employer pressing submit on the real form.
 *
 * Ownership is resolved from req.user on every single operation and is part of
 * every query filter. No handler reads an employer id from the request.
 */

// Steps that carry audio, in the order the wizard asks them. These map onto the
// AI service's deterministic extractors (plus jobSkills, the one LLM step).
export const VOICE_JOB_VOICE_STEPS = [
  "jobTitle",
  "jobDescription",
  "jobSkills",
  "jobWorkerCount",
  "jobCity",
  "jobPayAmount",
  "jobPayType",
];

// Answered by tapping, never sent to Whisper or Qwen. Keeping them out of the
// audio path is what stops a tap-only answer costing a transcription.
export const VOICE_JOB_TAP_STEPS = ["jobStartDate", "jobShiftType"];

export const VOICE_JOB_STEPS = [...VOICE_JOB_VOICE_STEPS, ...VOICE_JOB_TAP_STEPS];

/**
 * Every step is optional at DRAFT time.
 *
 * The Job schema's real requirements (title, category, coordinates, payType,
 * payAmount, startDate, originalLanguage) are enforced where they belong — on
 * publish, by the Job model and the job validators. Enforcing them here as
 * well would block an employer from saving a half-finished advert and resuming
 * it, which is the whole point of a draft.
 */
export const VOICE_JOB_OPTIONAL_STEPS = new Set(VOICE_JOB_STEPS);

const SPOKEN_LANGUAGES = ["mr", "hi", "en"];
const SHIFT_TYPES = ["day", "night", "flexible"];

/**
 * The authenticated user's employer profile.
 *
 * Every draft operation goes through this, so a user without an employer
 * profile can never reach a draft — including one they somehow know the id of.
 */
async function requireEmployerProfile(userId) {
  const employerProfile = await EmployerProfile.findOne({ userId });
  if (!employerProfile) {
    throw new ApiError(404, "Employer profile not found. Create your employer profile first.");
  }
  return employerProfile;
}

/**
 * Load (or optionally create) this employer's open draft for a language.
 *
 * employerId is always part of the filter rather than checked after the fact:
 * a draft belonging to someone else does not match, so it cannot be read,
 * written or deleted here at all.
 */
async function loadDraft(employerId, language, { create = false } = {}) {
  const filter = { employerId, language, status: "draft" };
  let draft = await VoiceJobDraft.findOne(filter);
  if (!draft && create) {
    try {
      draft = await VoiceJobDraft.create({
        employerId,
        language,
        draftFields: {},
        completedSteps: [],
        status: "draft",
      });
    } catch (error) {
      // Two concurrent "start" calls race on the unique index; the loser reads
      // the winner's document rather than failing the employer's request.
      if (error?.code === 11000) {
        draft = await VoiceJobDraft.findOne(filter);
      }
      if (!draft) throw error;
    }
  }
  return draft;
}

function serialiseDraft(draft) {
  return {
    voiceJobDraftId: draft._id,
    language: draft.language,
    status: draft.status,
    steps: VOICE_JOB_STEPS,
    voiceSteps: VOICE_JOB_VOICE_STEPS,
    tapSteps: VOICE_JOB_TAP_STEPS,
    draftFields: draft.draftFields || {},
    completedSteps: draft.completedSteps || [],
  };
}

/**
 * Record one answer.
 *
 * A step is only marked complete when it actually produced a value, so a
 * retry of a failed step does not look answered. Writing one field never
 * touches the others — a retry cannot erase unrelated valid answers.
 */
async function saveDraftStep(draft, field, value) {
  const fields = { ...(draft.draftFields || {}) };
  fields[field] = value;
  draft.draftFields = fields;
  draft.markModified("draftFields");

  const completed = new Set(draft.completedSteps || []);
  if (value === null || value === undefined || value === "") {
    completed.delete(field);
  } else {
    completed.add(field);
  }
  draft.completedSteps = [...completed];

  await draft.save();
  return draft;
}

/**
 * POST /voice-job/guided/start   { language }
 * Starts a new draft or resumes the open one for this language.
 */
export const startVoiceJobSession = asyncHandler(async (req, res) => {
  const { language = "mr" } = req.body ?? {};
  if (!SPOKEN_LANGUAGES.includes(language)) {
    throw new ApiError(400, "Language must be mr, hi or en");
  }

  const employerProfile = await requireEmployerProfile(req.user._id);
  const draft = await loadDraft(employerProfile._id, language, { create: true });

  return res
    .status(200)
    .json(new ApiResponse(200, serialiseDraft(draft), "Guided job session ready"));
});

/**
 * GET /voice-job/guided/draft?language=mr
 * The open draft, or null when there is none — which is what lets the UI offer
 * "resume" rather than silently restarting.
 */
export const getVoiceJobDraft = asyncHandler(async (req, res) => {
  const language = req.query?.language || "mr";
  if (!SPOKEN_LANGUAGES.includes(language)) {
    throw new ApiError(400, "Language must be mr, hi or en");
  }

  const employerProfile = await requireEmployerProfile(req.user._id);
  const draft = await loadDraft(employerProfile._id, language);

  return res
    .status(200)
    .json(new ApiResponse(200, draft ? serialiseDraft(draft) : null, draft ? "Draft found" : "No draft"));
});

/**
 * POST /voice-job/guided/step   multipart: audio, language, field
 *
 * The only route here that carries audio. The recording is transcribed and
 * deleted in the same request — it is never written to MongoDB, Cloudinary or
 * B2, matching the worker flow's privacy behaviour exactly.
 */
export const submitVoiceJobStep = asyncHandler(async (req, res) => {
  const { language = "mr", field } = req.body ?? {};

  if (!req.file) throw new ApiError(400, "Audio file is required");

  const cleanUp = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  };

  if (!VOICE_JOB_VOICE_STEPS.includes(field)) {
    cleanUp();
    throw new ApiError(400, `Field must be one of: ${VOICE_JOB_VOICE_STEPS.join(", ")}`);
  }
  if (!SPOKEN_LANGUAGES.includes(language)) {
    cleanUp();
    throw new ApiError(400, "Language must be mr, hi or en");
  }
  // Strictly === 0: an unknown size is not the same as an empty one.
  if (req.file.size === 0) {
    cleanUp();
    throw new ApiError(400, "The recording is empty. Please record again and speak for a few seconds.");
  }

  const employerProfile = await requireEmployerProfile(req.user._id);
  const draft = await loadDraft(employerProfile._id, language, { create: true });

  let result;
  try {
    result = await processVoiceFieldAudio(req.file.path, language, field);
  } catch (error) {
    if (error instanceof AiServiceUnavailableError) {
      throw new ApiError(503, "Voice processing is temporarily unavailable. Please try again shortly.");
    }
    logger.error("Guided voice job step failed", error);
    throw new ApiError(500, "Failed to process voice recording");
  } finally {
    cleanUp();
  }

  // The skills step speaks catalog phrases, not ids. Resolving them here means
  // the draft carries real Skill ids the Add Job form can select, and an
  // unrecognised phrase stays unresolved rather than being mapped to whatever
  // is nearest — the employer sees what was not understood.
  let skillResolution = null;
  let valueToStore = result.ok ? result.value : null;

  if (field === "jobSkills" && result.ok && Array.isArray(result.value) && result.value.length) {
    try {
      skillResolution = await resolveSkillsFromText(result.value, result.transcript);
      valueToStore = {
        raw: result.value,
        skillIds: skillResolution.resolved.map((s) => s.id),
        resolved: skillResolution.resolved,
        unresolved: skillResolution.unresolved,
      };
    } catch (error) {
      logger.error("Job skill resolution failed", error);
      // The phrases are still worth keeping: the employer can pick the skills
      // manually in the form rather than losing the answer entirely.
      valueToStore = { raw: result.value, skillIds: [], resolved: [], unresolved: result.value };
    }
  }

  await saveDraftStep(draft, field, valueToStore);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        voiceJobDraftId: draft._id,
        field: result.field,
        transcript: result.transcript,
        value: valueToStore,
        ok: result.ok,
        reason: result.reason,
        candidates: result.candidates,
        confidence: result.confidence,
        usedLlm: result.usedLlm,
        skillResolution,
        draftFields: draft.draftFields,
        completedSteps: draft.completedSteps,
      },
      result.ok ? "Step captured" : "Could not understand that - please try again"
    )
  );
});

/**
 * PATCH /voice-job/guided/step   { language, field, value }
 *
 * The no-audio path: tap-only steps and every manual correction the employer
 * makes on the review screen. No AI call is made here.
 */
export const setVoiceJobDraftField = asyncHandler(async (req, res) => {
  const { language = "mr", field, value } = req.body ?? {};

  if (!VOICE_JOB_STEPS.includes(field)) {
    throw new ApiError(400, `Field must be one of: ${VOICE_JOB_STEPS.join(", ")}`);
  }
  if (!SPOKEN_LANGUAGES.includes(language)) {
    throw new ApiError(400, "Language must be mr, hi or en");
  }
  if (field === "jobShiftType" && value !== null && !SHIFT_TYPES.includes(value)) {
    throw new ApiError(400, `Shift type must be one of: ${SHIFT_TYPES.join(", ")}`);
  }

  const employerProfile = await requireEmployerProfile(req.user._id);
  const draft = await loadDraft(employerProfile._id, language, { create: true });

  await saveDraftStep(draft, field, value === undefined ? null : value);

  return res
    .status(200)
    .json(new ApiResponse(200, serialiseDraft(draft), "Draft updated"));
});

/**
 * POST /voice-job/guided/consume   { language }
 *
 * Marks the draft as handed over to the Add Job form. This is NOT a publish:
 * no Job is created here. It exists so that the next "start" opens a clean
 * wizard instead of resuming an advert the employer has already moved past.
 */
export const consumeVoiceJobDraft = asyncHandler(async (req, res) => {
  const { language = "mr" } = req.body ?? {};
  if (!SPOKEN_LANGUAGES.includes(language)) {
    throw new ApiError(400, "Language must be mr, hi or en");
  }

  const employerProfile = await requireEmployerProfile(req.user._id);
  const draft = await loadDraft(employerProfile._id, language);
  if (!draft) throw new ApiError(404, "No draft to consume");

  draft.status = "consumed";
  draft.consumedAt = new Date();
  await draft.save();

  return res
    .status(200)
    .json(new ApiResponse(200, serialiseDraft(draft), "Draft handed to the job form"));
});

/**
 * DELETE /voice-job/guided/draft   { language }
 * Abandons the draft deliberately. No job is affected.
 */
export const discardVoiceJobDraft = asyncHandler(async (req, res) => {
  const language = req.body?.language || req.query?.language || "mr";
  if (!SPOKEN_LANGUAGES.includes(language)) {
    throw new ApiError(400, "Language must be mr, hi or en");
  }

  const employerProfile = await requireEmployerProfile(req.user._id);
  const deleted = await VoiceJobDraft.findOneAndDelete({
    employerId: employerProfile._id,
    language,
    status: "draft",
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { discarded: Boolean(deleted) }, deleted ? "Draft discarded" : "No draft to discard"));
});
