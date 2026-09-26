import Resume from "../models/resume.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import VoiceProfile from "../models/voiceProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getResume = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const resume = await Resume.findOne({ workerId: workerProfile._id });
  return res.status(200).json(new ApiResponse(200, resume, "Resume retrieved"));
});

export const editResume = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const resume = await Resume.findOneAndUpdate(
    { workerId: workerProfile._id },
    { ...req.body, workerId: workerProfile._id },
    { upsert: true, new: true, runValidators: true }
  );

  return res.status(200).json(new ApiResponse(200, resume, "Resume updated"));
});

export const generateFromVoice = asyncHandler(async (req, res) => {
  const { voiceProfileId } = req.body;
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const voiceProfile = await VoiceProfile.findById(voiceProfileId);
  if (!voiceProfile) throw new ApiError(404, "Voice profile not found");

  const fields = voiceProfile.extractedFields || {};

  const resume = await Resume.findOneAndUpdate(
    { workerId: workerProfile._id },
    {
      workerId: workerProfile._id,
      headline: fields.headline || `${workerProfile.fullName} - Skilled Worker`,
      summary: fields.bio || voiceProfile.transcript || "",
      sourceVoiceProfileId: voiceProfile._id,
      aiGenerated: true,
      status: "published",
      generatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  return res.status(200).json(new ApiResponse(200, resume, "Resume generated from voice profile"));
});

export const publishOrArchive = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["draft", "published", "archived"].includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const resume = await Resume.findOneAndUpdate(
    { workerId: workerProfile._id },
    { status },
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, resume, `Resume status changed to ${status}`));
});

export const exportPDF = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const resume = await Resume.findOne({ workerId: workerProfile._id });
  if (!resume) throw new ApiError(404, "Resume not found");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        downloadUrl: resume.resumeUrl || `https://lokrozgar.ai/exports/resumes/${resume._id}.pdf`,
        resume,
        workerProfile,
      },
      "Resume PDF export generated"
    )
  );
});
