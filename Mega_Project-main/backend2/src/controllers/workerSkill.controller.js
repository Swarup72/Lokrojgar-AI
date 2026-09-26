import WorkerSkill from "../models/workerSkill.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getMySkills = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const skills = await WorkerSkill.find({ workerId: workerProfile._id }).populate("skillId");
  return res.status(200).json(new ApiResponse(200, skills, "Worker skills retrieved"));
});

export const addWorkerSkill = asyncHandler(async (req, res) => {
  const { skillId, proficiency } = req.body;
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const workerSkill = await WorkerSkill.create({
    workerId: workerProfile._id,
    skillId,
    proficiency: proficiency || "intermediate",
  });

  return res.status(201).json(new ApiResponse(201, workerSkill, "Worker skill added"));
});

export const updateWorkerSkill = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { proficiency } = req.body;
  const workerSkill = await WorkerSkill.findByIdAndUpdate(id, { proficiency }, { new: true });
  if (!workerSkill) throw new ApiError(404, "Worker skill not found");
  return res.status(200).json(new ApiResponse(200, workerSkill, "Worker skill updated"));
});

export const removeWorkerSkill = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await WorkerSkill.findByIdAndDelete(id);
  return res.status(200).json(new ApiResponse(200, {}, "Worker skill removed"));
});

export const requestVerification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const workerSkill = await WorkerSkill.findByIdAndUpdate(
    id,
    { verificationStatus: "pending" },
    { new: true }
  );
  if (!workerSkill) throw new ApiError(404, "Worker skill not found");
  return res.status(200).json(new ApiResponse(200, workerSkill, "Verification requested"));
});

export const attachEvidenceJob = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { jobId } = req.body;

  const workerSkill = await WorkerSkill.findById(id);
  if (!workerSkill) throw new ApiError(404, "Worker skill not found");

  if (!workerSkill.evidenceJobIds.includes(jobId)) {
    workerSkill.evidenceJobIds.push(jobId);
    await workerSkill.save();
  }

  return res.status(200).json(new ApiResponse(200, workerSkill, "Evidence job attached"));
});
