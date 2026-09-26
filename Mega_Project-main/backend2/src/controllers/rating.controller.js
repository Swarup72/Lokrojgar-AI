import Rating from "../models/rating.model.js";
import Job from "../models/job.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const submitRating = asyncHandler(async (req, res) => {
  const { jobId, toUserId, score, review } = req.body;

  const job = await Job.findById(jobId);
  if (!job) throw new ApiError(404, "Job not found");

  if (job.status !== "completed") {
    throw new ApiError(400, "Ratings are only allowed after the job is completed");
  }

  const existingRating = await Rating.findOne({
    jobId,
    fromUserId: req.user._id,
    toUserId,
  });

  if (existingRating) {
    throw new ApiError(409, "You have already rated this user for this job");
  }

  const ratingDoc = await Rating.create({
    jobId,
    fromUserId: req.user._id,
    toUserId,
    rating: score,
    review: review || "",
  });

  // Automatically update target profile's ratingAvg and ratingCount
  const workerProfile = await WorkerProfile.findOne({ userId: toUserId });
  const employerProfile = await EmployerProfile.findOne({ userId: toUserId });

  if (workerProfile) {
    const oldCount = workerProfile.ratingCount || 0;
    const oldAvg = workerProfile.ratingAvg || 0;
    const newCount = oldCount + 1;
    const newAvg = (oldAvg * oldCount + score) / newCount;

    workerProfile.ratingCount = newCount;
    workerProfile.ratingAvg = Math.round(newAvg * 100) / 100;
    await workerProfile.save();
  } else if (employerProfile) {
    const oldCount = employerProfile.ratingCount || 0;
    const oldAvg = employerProfile.ratingAvg || 0;
    const newCount = oldCount + 1;
    const newAvg = (oldAvg * oldCount + score) / newCount;

    employerProfile.ratingCount = newCount;
    employerProfile.ratingAvg = Math.round(newAvg * 100) / 100;
    await employerProfile.save();
  }

  return res.status(201).json(new ApiResponse(201, ratingDoc, "Rating submitted and profile score updated"));
});

export const getUserRatings = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const ratings = await Rating.find({ toUserId: userId })
    .populate("fromUserId", "phone avatar")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, ratings, "User ratings retrieved"));
});
