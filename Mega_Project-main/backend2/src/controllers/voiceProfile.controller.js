import fs from "fs";
import VoiceProfile from "../models/voiceProfile.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import WorkerSkill from "../models/workerSkill.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { processVoiceProfileAudio, AiServiceUnavailableError } from "../services/ai.service.js";
import { resolveSkillsFromText, resolveJobCategoriesFromText } from "../utils/skillNormalization.js";
import logger from "../utils/logger.js";

export const uploadAudioAndExtract = asyncHandler(async (req, res) => {
  const { language } = req.body;
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

export const confirmAndApplyToProfile = asyncHandler(async (req, res) => {
  const { voiceProfileId, confirmedFields } = req.body;

  const voiceProfile = await VoiceProfile.findById(voiceProfileId);
  if (!voiceProfile) throw new ApiError(404, "Voice profile not found");

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  if (confirmedFields.fullName) workerProfile.fullName = confirmedFields.fullName;
  if (confirmedFields.city) workerProfile.city = confirmedFields.city;
  if (confirmedFields.expectedPay) workerProfile.expectedPay = confirmedFields.expectedPay;
  if (confirmedFields.experienceYears) workerProfile.experienceYears = confirmedFields.experienceYears;
  if (confirmedFields.availability) workerProfile.availability = confirmedFields.availability;
  if (confirmedFields.languages) workerProfile.languages = confirmedFields.languages;
  if (confirmedFields.bio) {
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
