import SavedJob from "../models/savedJob.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const saveJob = asyncHandler(async (req, res) => {
  const { jobId } = req.body;
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const saved = await SavedJob.findOneAndUpdate(
    { workerId: workerProfile._id, jobId },
    { workerId: workerProfile._id, jobId, savedAt: new Date() },
    { upsert: true, new: true }
  );

  return res.status(201).json(new ApiResponse(201, saved, "Job saved to bookmarks"));
});

export const unsaveJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  await SavedJob.deleteOne({ workerId: workerProfile._id, jobId });
  return res.status(200).json(new ApiResponse(200, {}, "Job removed from bookmarks"));
});

export const listSavedJobs = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const savedJobs = await SavedJob.find({ workerId: workerProfile._id })
    .populate({
      path: "jobId",
      populate: { path: "employerId categoryId" },
    })
    .sort({ savedAt: -1 });

  return res.status(200).json(new ApiResponse(200, savedJobs, "Saved jobs retrieved"));
});
