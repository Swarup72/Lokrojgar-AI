import fs from "fs";
import VoiceProfile from "../models/voiceProfile.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import WorkerSkill from "../models/workerSkill.model.js";
import User from "../models/user.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  processVoiceProfileAudio,
  processVoiceFieldAudio,
  AiServiceUnavailableError,
} from "../services/ai.service.js";
import { resolveSkillsFromText, resolveJobCategoriesFromText } from "../utils/skillNormalization.js";
import logger from "../utils/logger.js";

export const uploadAudioAndExtract = asyncHandler(async (req, res) => {
  // `?? {}` because a request with no multipart body at all leaves req.body
  // undefined, and destructuring it threw before the "no file" check could
  // answer - surfacing as 500 "Cannot destructure property 'language'" instead
  // of the 400 this is. The missing file is still what gets reported.
  const { language } = req.body ?? {};
  if (!req.file) throw new ApiError(400, "Audio file is required");

  // A zero-byte upload is bad input, not a server fault. MediaRecorder
  // produces an empty Blob when a recording is stopped before any audio
  // chunk arrives (a very short tap on Record), and AudioUploader already
  // rejects empty *files* client-side - but nothing guarded an empty
  // *recording*. Without this it reached Whisper, failed there, and
  // surfaced as a 500 "Failed to process voice recording", which the UI
  // shows as a generic error with nothing the worker can act on.
  // The temp file is removed here because the try/finally that normally
  // cleans it up is further down.
  // Strictly === 0: an absent size means "unknown", which is not the same
  // as "empty" and must not be rejected.
  if (req.file.size === 0) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    throw new ApiError(400, "The recording is empty. Please record again and speak for a few seconds.");
  }

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const localFilePath = req.file.path;
  let transcript;
  let extractedProfile;
  let confidence;

  try {
    // The recording is a processing artifact, not stored user data: it is
    // transcribed here and then deleted in the finally block below. Nothing
    // in the product reads a saved recording back (verified by a
    // repository-wide search), so uploading it to permanent storage only
    // accumulated audio nobody could ever reach.
    try {
      ({ transcript, extractedProfile, confidence } = await processVoiceProfileAudio(
        localFilePath,
        language || "mr"
      ));
    } catch (error) {
      if (error instanceof AiServiceUnavailableError) {
        throw new ApiError(503, "Voice processing service is currently unavailable. Please try again later.");
      }
      logger.error("Voice processing failed", error);
      throw new ApiError(500, "Failed to process voice recording. Please try again.");
    }
  } finally {
    // The ONLY place the recording is removed, and it runs on every path -
    // success, transcription failure, or extraction failure alike. Nothing
    // else in this flow deletes it, so this block is load-bearing.
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
  }

  const voiceProfile = await VoiceProfile.findOneAndUpdate(
    { workerId: workerProfile._id, language: language || "mr" },
    {
      workerId: workerProfile._id,
      language: language || "mr",
      transcript,
      extractedFields: extractedProfile,
      confidence,
    },
    { upsert: true, new: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, voiceProfile, "Audio processed and profile fields extracted"));
});

/**
 * Was a value actually supplied, as opposed to absent?
 *
 * The confirm path used to guard every assignment with plain truthiness
 * (`if (confirmedFields.experienceYears)`), which cannot tell "the worker did
 * not answer" apart from "the worker answered zero". A fresher confirming
 * experienceYears = 0 was silently ignored and any earlier value survived -
 * measured: confirming 0 against a stored 5 left it at 5, even though the
 * schema declares `min: 0` and 0 is a legitimate value.
 *
 * Only null and undefined mean "not supplied". 0 is a real number and must be
 * able to replace an existing value.
 */
const isSupplied = (value) => value !== undefined && value !== null;

/**
 * A supplied, non-blank string.
 *
 * Numbers use isSupplied(), but text does not: an empty or whitespace-only
 * name, city, bio or availability is a failed extraction, not an answer, and
 * must never replace a good stored value. This keeps the original intent for
 * text fields while fixing it for numbers.
 */
const isSuppliedText = (value) => typeof value === "string" && value.trim().length > 0;

export const confirmAndApplyToProfile = asyncHandler(async (req, res) => {
  // confirmedFields defaults to {} so a request that omits it is a clean 404/no-op
  // rather than a TypeError surfacing as a 500.
  const { voiceProfileId, confirmedFields = {}, role = "worker" } = req.body;

  if (role === "employer") {
    const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
    if (!employerProfile) throw new ApiError(404, "Employer profile not found");

    const voiceProfile = await VoiceProfile.findOne({
      _id: voiceProfileId,
      employerId: employerProfile._id,
    });
    if (!voiceProfile) throw new ApiError(404, "Voice profile not found");

    if (isSuppliedText(confirmedFields.fullName)) {
      await User.updateOne({ _id: req.user._id }, { fullName: confirmedFields.fullName });
    }
    if (isSuppliedText(confirmedFields.businessName)) employerProfile.businessName = confirmedFields.businessName;
    if (isSuppliedText(confirmedFields.businessType)) employerProfile.businessType = confirmedFields.businessType;
    if (isSuppliedText(confirmedFields.city)) employerProfile.city = confirmedFields.city;
    if (isSuppliedText(confirmedFields.village)) employerProfile.village = confirmedFields.village;
    if (isSuppliedText(confirmedFields.bio)) {
      employerProfile.bio = {
        ...employerProfile.bio,
        [voiceProfile.language || "mr"]: confirmedFields.bio,
      };
    }

    await employerProfile.save();

    if (voiceProfile.status !== "committed") {
      voiceProfile.status = "committed";
      voiceProfile.committedAt = new Date();
      await voiceProfile.save();
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          employerProfile,
          fullName: confirmedFields.fullName || null,
        },
        "Employer profile updated from voice input"
      )
    );
  }

  // Worker confirmation path
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const voiceProfile = await VoiceProfile.findOne({
    _id: voiceProfileId,
    workerId: workerProfile._id,
  });
  if (!voiceProfile) throw new ApiError(404, "Voice profile not found");

  if (isSuppliedText(confirmedFields.fullName)) workerProfile.fullName = confirmedFields.fullName;
  if (isSuppliedText(confirmedFields.city)) workerProfile.city = confirmedFields.city;
  // Numbers: 0 is a real value. The schema's own `min: 0` still rejects
  // anything negative, so this does not widen what may be stored.
  if (isSupplied(confirmedFields.expectedPay)) workerProfile.expectedPay = confirmedFields.expectedPay;
  if (isSupplied(confirmedFields.experienceYears)) {
    workerProfile.experienceYears = confirmedFields.experienceYears;
  }
  if (isSuppliedText(confirmedFields.availability)) workerProfile.availability = confirmedFields.availability;
  // An empty array is a failed extraction, not "I speak no languages", so it
  // must not clear a stored list.
  if (Array.isArray(confirmedFields.languages) && confirmedFields.languages.length > 0) {
    workerProfile.languages = confirmedFields.languages;
  }
  if (isSuppliedText(confirmedFields.bio)) {
    workerProfile.bio = {
      ...workerProfile.bio,
      [voiceProfile.language || "mr"]: confirmedFields.bio,
    };
  }
  // confirmedFields.skills / .preferredJobCategories are free text from
  // voice extraction - resolved against the real Skill/JobCategory catalog
  // via deterministic normalization (see utils/skillNormalization.js) so
  // the existing ID-based matching system can actually use them. A value
  // that doesn't match anything in the catalog (e.g. an occupation with no
  // corresponding seeded Skill yet) is never force-matched or invented -
  // it comes back in `unresolved` so the worker can see it stayed as free
  // text, per the "do not silently modify worker information" rule.
  let skillResolution = { resolved: [], unresolved: [] };
  if (Array.isArray(confirmedFields.skills) && confirmedFields.skills.length > 0) {
    skillResolution = await resolveSkillsFromText(confirmedFields.skills, voiceProfile.transcript);
    for (const { id: skillId } of skillResolution.resolved) {
      await WorkerSkill.findOneAndUpdate(
        { workerId: workerProfile._id, skillId },
        { $setOnInsert: { workerId: workerProfile._id, skillId, proficiency: "intermediate" } },
        { upsert: true, new: true }
      );
    }
  }

  let categoryResolution = { resolved: [], unresolved: [] };
  if (Array.isArray(confirmedFields.preferredJobCategories) && confirmedFields.preferredJobCategories.length > 0) {
    categoryResolution = await resolveJobCategoriesFromText(confirmedFields.preferredJobCategories);
    const existingIds = new Set(workerProfile.preferredJobCategories.map((id) => id.toString()));
    for (const { id: categoryId } of categoryResolution.resolved) {
      if (!existingIds.has(categoryId)) {
        workerProfile.preferredJobCategories.push(categoryId);
        existingIds.add(categoryId);
      }
    }
  }

  await workerProfile.save();

  // Both flows finish here, so this is the single place a session is marked
  // applied. A guided draft becomes "committed" only AFTER the profile save
  // above succeeded - if that throws, the draft stays a draft and the worker can
  // try again without having lost their answers.
  if (voiceProfile.status !== "committed") {
    voiceProfile.status = "committed";
    voiceProfile.committedAt = new Date();
    await voiceProfile.save();
  }

  return res.status(200).json(
    new ApiResponse(200, {
      workerProfile,
      voiceSkillResolution: {
        skills: skillResolution,
        preferredJobCategories: categoryResolution,
      },
    }, "Profile updated from voice input")
  );
});

// =============================================================================
// GUIDED VOICE PROFILE
//
// One question at a time, answers accumulated in a server-side DRAFT, and
// nothing applied to the canonical Profile until the user confirms.
//
// The draft is a VoiceProfile document with mode: "guided" and
// status: "draft" - not a new collection. It is scoped to the authenticated
// user on every read and write: the profile is resolved from req.user
// and workerId / employerId is part of the query FILTER, never taken from the body.
// =============================================================================

// Worker steps
export const GUIDED_VOICE_STEPS = ["fullName", "expectedPay", "experienceYears", "skills", "city"];
export const GUIDED_TAP_STEPS = ["languages", "availability"];
export const GUIDED_STEPS = [...GUIDED_VOICE_STEPS, ...GUIDED_TAP_STEPS];
export const GUIDED_OPTIONAL_STEPS = new Set(["expectedPay", "experienceYears", "skills", "city", "languages", "availability"]);

// Employer steps: personal name, business name (optional), business type, location
export const GUIDED_EMPLOYER_VOICE_STEPS = ["fullName", "businessName", "businessType", "city"];
export const GUIDED_EMPLOYER_TAP_STEPS = [];
export const GUIDED_EMPLOYER_STEPS = [...GUIDED_EMPLOYER_VOICE_STEPS];
export const GUIDED_EMPLOYER_OPTIONAL_STEPS = new Set(["businessName", "businessType", "city"]);

/**
 * The user's guided draft for this spoken language and role, created on first use.
 *
 * Ownership is established here, once, from req.user - every guided handler goes
 * through this function, so no handler can accidentally operate on someone
 * else's draft.
 */
const loadGuidedDraft = async (userId, language, { create = false, role = "worker" } = {}) => {
  if (role === "employer") {
    let employerProfile = await EmployerProfile.findOne({ userId });
    if (!employerProfile && create) {
      employerProfile = await EmployerProfile.create({ userId });
    }
    if (!employerProfile) throw new ApiError(404, "Employer profile not found");

    const filter = { employerId: employerProfile._id, language, mode: "guided", profileType: "employer" };
    let draft = await VoiceProfile.findOne(filter);

    if (!draft && create) {
      try {
        draft = await VoiceProfile.create({
          ...filter,
          status: "draft",
          draftFields: {},
          completedSteps: [],
        });
      } catch (error) {
        if (error.code === 11000) {
          draft = await VoiceProfile.findOne(filter);
        } else {
          throw error;
        }
      }
    }

    return { profile: employerProfile, employerProfile, draft, profileType: "employer" };
  }

  const workerProfile = await WorkerProfile.findOne({ userId });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const filter = { workerId: workerProfile._id, language, mode: "guided" };
  let draft = await VoiceProfile.findOne(filter);

  if (!draft && create) {
    try {
      draft = await VoiceProfile.create({
        ...filter,
        profileType: "worker",
        status: "draft",
        draftFields: {},
        completedSteps: [],
      });
    } catch (error) {
      if (error.code === 11000) {
        draft = await VoiceProfile.findOne(filter);
      } else {
        throw error;
      }
    }
  }

  return { profile: workerProfile, workerProfile, draft, profileType: "worker" };
};

/**
 * POST /voice-profile/guided/start   { language, role }
 *
 * Starts or RESUMES the guided session. Resuming is the point: a worker/employer who
 * answered steps and closed the browser comes back to those answers
 * instead of starting over.
 */
export const startGuidedSession = asyncHandler(async (req, res) => {
  const { language = "mr", role = "worker" } = req.body ?? {};
  if (!["mr", "hi", "en"].includes(language)) {
    throw new ApiError(400, "Language must be mr, hi or en");
  }
  if (!["worker", "employer"].includes(role)) {
    throw new ApiError(400, "Role must be worker or employer");
  }

  const { draft } = await loadGuidedDraft(req.user._id, language, { create: true, role });
  const isEmployer = role === "employer";

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        voiceProfileId: draft._id,
        language: draft.language,
        mode: draft.mode,
        status: draft.status,
        role,
        profileType: draft.profileType || role,
        steps: isEmployer ? GUIDED_EMPLOYER_STEPS : GUIDED_STEPS,
        voiceSteps: isEmployer ? GUIDED_EMPLOYER_VOICE_STEPS : GUIDED_VOICE_STEPS,
        tapSteps: isEmployer ? GUIDED_EMPLOYER_TAP_STEPS : GUIDED_TAP_STEPS,
        draftFields: draft.draftFields || {},
        completedSteps: draft.completedSteps || [],
      },
      "Guided voice session ready"
    )
  );
});

/**
 * GET /voice-profile/guided/draft?language=mr&role=worker
 *
 * The current draft, or null when there is none. Used on page load to offer a
 * resume rather than silently discarding earlier answers.
 */
export const getGuidedDraft = asyncHandler(async (req, res) => {
  const language = req.query?.language || "mr";
  const role = req.query?.role || "worker";
  if (!["mr", "hi", "en"].includes(language)) {
    throw new ApiError(400, "Language must be mr, hi or en");
  }
  if (!["worker", "employer"].includes(role)) {
    throw new ApiError(400, "Role must be worker or employer");
  }

  const { draft } = await loadGuidedDraft(req.user._id, language, { role });

  if (!draft) {
    return res.status(200).json(new ApiResponse(200, null, "No guided draft in progress"));
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        voiceProfileId: draft._id,
        language: draft.language,
        status: draft.status,
        role,
        profileType: draft.profileType || role,
        draftFields: draft.draftFields || {},
        completedSteps: draft.completedSteps || [],
      },
      "Guided draft retrieved"
    )
  );
});

/** Records one answer on the draft without disturbing the others. */
const saveDraftStep = async (draft, field, value, { transcript = null } = {}) => {
  const draftFields = { ...(draft.draftFields || {}) };
  const completedSteps = new Set(draft.completedSteps || []);

  if (value === null || value === undefined) {
    // A retry that failed must not destroy the answer the user already had.
    // Leaving the previous value alone is the whole reason a retry is safe.
    if (!(field in draftFields)) draftFields[field] = null;
  } else {
    draftFields[field] = value;
    completedSteps.add(field);
  }

  draft.draftFields = draftFields;
  draft.completedSteps = [...completedSteps];
  // The transcript is kept only for the step just answered, so the review screen
  // can show what was heard. No audio is retained, in either flow.
  if (transcript !== null) draft.transcript = transcript;
  draft.markModified("draftFields");
  await draft.save();
  return draft;
};

/**
 * POST /voice-profile/guided/step   multipart: audio, language, field, role
 *
 * One voice step. Transcribes the recording, extracts THAT field only, and
 * records it on the draft. The recording is deleted immediately afterwards.
 *
 * A field the extractor could not resolve is NOT an error: it comes back with
 * ok=false and a reason so the user can say it again, and any previous answer
 * for that field survives.
 */
export const submitGuidedVoiceStep = asyncHandler(async (req, res) => {
  const { language = "mr", field, role = "worker" } = req.body ?? {};

  if (!req.file) throw new ApiError(400, "Audio file is required");

  const cleanUp = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  };

  const allowedVoiceSteps = role === "employer" ? GUIDED_EMPLOYER_VOICE_STEPS : GUIDED_VOICE_STEPS;
  if (!allowedVoiceSteps.includes(field)) {
    cleanUp();
    throw new ApiError(400, `Field must be one of: ${allowedVoiceSteps.join(", ")}`);
  }
  if (!["mr", "hi", "en"].includes(language)) {
    cleanUp();
    throw new ApiError(400, "Language must be mr, hi or en");
  }
  if (!["worker", "employer"].includes(role)) {
    cleanUp();
    throw new ApiError(400, "Role must be worker or employer");
  }
  // Same guard as the quick flow: strictly === 0, because an unknown size is
  // not the same as an empty one.
  if (req.file.size === 0) {
    cleanUp();
    throw new ApiError(400, "The recording is empty. Please record again and speak for a few seconds.");
  }

  const { draft } = await loadGuidedDraft(req.user._id, language, { create: true, role });

  let result;
  try {
    result = await processVoiceFieldAudio(req.file.path, language, field);
  } catch (error) {
    if (error instanceof AiServiceUnavailableError) {
      throw new ApiError(503, "Voice processing is temporarily unavailable. Please try again shortly.");
    }
    logger.error("Guided voice step failed", error);
    throw new ApiError(500, "Failed to process voice recording");
  } finally {
    // The recording is a processing artifact in this flow too - transcribed,
    // then deleted. Nothing is uploaded to permanent storage.
    cleanUp();
  }

  await saveDraftStep(draft, field, result.ok ? result.value : null, { transcript: result.transcript });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        voiceProfileId: draft._id,
        field: result.field,
        transcript: result.transcript,
        value: result.ok ? result.value : null,
        ok: result.ok,
        reason: result.reason,
        candidates: result.candidates,
        confidence: result.confidence,
        usedLlm: result.usedLlm,
        draftFields: draft.draftFields,
        completedSteps: draft.completedSteps,
      },
      result.ok ? "Step captured" : "Could not understand that - please try again"
    )
  );
});

/**
 * PATCH /voice-profile/guided/step   { language, field, value, role }
 *
 * The non-voice path: tap-only steps and manual corrections on review screen.
 */
export const setGuidedDraftField = asyncHandler(async (req, res) => {
  const { language = "mr", field, value, role = "worker" } = req.body ?? {};

  const allowedSteps = role === "employer" ? GUIDED_EMPLOYER_STEPS : GUIDED_STEPS;
  if (!allowedSteps.includes(field)) {
    throw new ApiError(400, `Field must be one of: ${allowedSteps.join(", ")}`);
  }
  if (!["mr", "hi", "en"].includes(language)) {
    throw new ApiError(400, "Language must be mr, hi or en");
  }
  if (!["worker", "employer"].includes(role)) {
    throw new ApiError(400, "Role must be worker or employer");
  }

  // Validated here rather than trusted: these values go on to the profile
  if (field === "languages") {
    if (!Array.isArray(value) || value.some((entry) => !["mr", "hi", "en"].includes(entry))) {
      throw new ApiError(400, "Languages must be an array of mr, hi or en");
    }
  }
  if (field === "availability" && !["available", "busy", "unavailable"].includes(value)) {
    throw new ApiError(400, "Availability must be available, busy or unavailable");
  }
  if (field === "expectedPay" || field === "experienceYears") {
    if (value !== null && (typeof value !== "number" || Number.isNaN(value) || value < 0)) {
      throw new ApiError(400, `${field} must be a number of 0 or more`);
    }
    if (field === "experienceYears" && typeof value === "number" && value > 60) {
      throw new ApiError(400, "Experience must be between 0 and 60 years");
    }
  }

  const { draft } = await loadGuidedDraft(req.user._id, language, { create: true, role });
  await saveDraftStep(draft, field, value);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        voiceProfileId: draft._id,
        field,
        value,
        draftFields: draft.draftFields,
        completedSteps: draft.completedSteps,
      },
      "Step saved"
    )
  );
});

/**
 * DELETE /voice-profile/guided/draft   { language, role }
 *
 * Abandon the session deliberately. Deletes only the DRAFT - the canonical profile is untouched.
 */
export const discardGuidedDraft = asyncHandler(async (req, res) => {
  const { language = "mr", role = "worker" } = req.body ?? {};
  if (role === "employer") {
    const { employerProfile } = await loadGuidedDraft(req.user._id, language, { role: "employer" });
    await VoiceProfile.deleteOne({ employerId: employerProfile._id, language, mode: "guided", status: "draft" });
  } else {
    const { workerProfile } = await loadGuidedDraft(req.user._id, language, { role: "worker" });
    await VoiceProfile.deleteOne({ workerId: workerProfile._id, language, mode: "guided", status: "draft" });
  }

  return res.status(200).json(new ApiResponse(200, {}, "Guided draft discarded"));
});
