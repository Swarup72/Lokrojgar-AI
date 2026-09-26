import VoiceProfile from "../models/voiceProfile.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadAudioService } from "../services/storage.service.js";
import { processVoiceProfileAudio } from "../services/ai.service.js";

export const uploadAudioAndExtract = asyncHandler(async (req, res) => {
  const { language } = req.body;
  if (!req.file) throw new ApiError(400, "Audio file is required");

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const uploadResult = await uploadAudioService(req.file.path);
  if (!uploadResult) throw new ApiError(500, "Failed to upload audio file");

  const { transcript, extractedProfile } = await processVoiceProfileAudio(
    req.file.path,
    language || "mr"
  );

  const voiceProfile = await VoiceProfile.findOneAndUpdate(
    { workerId: workerProfile._id, language: language || "mr" },
    {
      workerId: workerProfile._id,
      language: language || "mr",
      audioUrl: uploadResult.secure_url,
      transcript,
      extractedFields: extractedProfile,
      confidence: 0.9,
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
  if (confirmedFields.bio) {
    workerProfile.bio = {
      ...workerProfile.bio,
      [voiceProfile.language || "mr"]: confirmedFields.bio,
    };
  }

  await workerProfile.save();

  return res.status(200).json(new ApiResponse(200, workerProfile, "Profile updated from voice input"));
});
