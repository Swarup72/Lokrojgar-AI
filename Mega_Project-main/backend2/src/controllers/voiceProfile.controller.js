import fs from "fs";
import VoiceProfile from "../models/voiceProfile.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadAudioService } from "../services/storage.service.js";
import { processVoiceProfileAudio, AiServiceUnavailableError } from "../services/ai.service.js";
import logger from "../utils/logger.js";

export const uploadAudioAndExtract = asyncHandler(async (req, res) => {
  const { language } = req.body;
  if (!req.file) throw new ApiError(400, "Audio file is required");

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const localFilePath = req.file.path;
  let transcript;
  let extractedProfile;
  let confidence;
  let uploadResult;

  try {
    // Transcription MUST run before the Cloudinary upload - uploadAudioService
    // deletes the local temp file on success (see utils/cloudinary.js), and
    // processVoiceProfileAudio needs to read that same file from disk. This
    // ordering is the fix for a previously-confirmed bug where the file was
    // deleted before it was ever read, which only stayed hidden because no
    // AI provider key was configured.
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

    uploadResult = await uploadAudioService(localFilePath);
    if (!uploadResult) throw new ApiError(500, "Failed to upload audio file");
  } finally {
    // uploadOnCloudinary already deletes the local file on both its own
    // success and failure paths. This is a defensive backstop for the case
    // where processing failed BEFORE the upload step ever ran, so the file
    // would otherwise be left behind in ./public/temp.
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
  }

  const voiceProfile = await VoiceProfile.findOneAndUpdate(
    { workerId: workerProfile._id, language: language || "mr" },
    {
      workerId: workerProfile._id,
      language: language || "mr",
      audioUrl: uploadResult.secure_url,
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
  // confirmedFields.skills / confirmedFields.preferredJobCategories are
  // intentionally NOT applied here. Both are free-text AI output and would
  // need resolving against real catalog ObjectIds (Skill / JobCategory) -
  // no safe existing lookup mechanism exists in this codebase for that, and
  // inventing one was explicitly out of scope for this migration. They stay
  // visible in VoiceProfile.extractedFields for the frontend to show the
  // worker, but are not auto-applied to WorkerSkill/WorkerProfile.

  await workerProfile.save();

  return res.status(200).json(new ApiResponse(200, workerProfile, "Profile updated from voice input"));
});
