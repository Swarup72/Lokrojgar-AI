import Rating from "../models/rating.model.js";
import Job from "../models/job.model.js";
import Application from "../models/application.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Derives who req.user is ALLOWED to rate for this (already-completed) job,
 * entirely from server-side relationships - never from anything the client
 * supplied. Returns the set of legitimate target User ids as strings.
 *
 * - The job's employer may rate any worker with an ACCEPTED application for
 *   this job (a job can legitimately have multiple accepted workers when
 *   Job.requiredWorkers > 1 - see job.model.js/application.controller.js's
 *   filledWorkers logic - so this is deliberately a set, not a single id).
 * - A worker with an accepted application for this job may rate the job's
 *   employer (exactly one legitimate target).
 * - Anyone else (not the employer, no accepted application on this job)
 *   has no legitimate target at all - an empty set.
 */
async function getLegitimateRatingTargets(job, requesterUserId) {
  const employerProfile = await EmployerProfile.findById(job.employerId);
  const isEmployer = !!employerProfile && employerProfile.userId.toString() === requesterUserId.toString();

  if (isEmployer) {
    const acceptedApplications = await Application.find({ jobId: job._id, status: "accepted" }).populate(
      "workerId"
    );
    const workerUserIds = acceptedApplications
      .map((application) => application.workerId?.userId?.toString())
      .filter(Boolean);
    return new Set(workerUserIds);
  }

  const workerProfile = await WorkerProfile.findOne({ userId: requesterUserId });
  if (!workerProfile) return new Set();

  const acceptedApplication = await Application.findOne({
    jobId: job._id,
    workerId: workerProfile._id,
    status: "accepted",
  });
  if (!acceptedApplication) return new Set();

  const employerUserId = employerProfile?.userId?.toString();
  return employerUserId ? new Set([employerUserId]) : new Set();
}

export const submitRating = asyncHandler(async (req, res) => {
  const { jobId, toUserId, score, review } = req.body;

  const job = await Job.findById(jobId);
  if (!job) throw new ApiError(404, "Job not found");

  if (job.status !== "completed") {
    throw new ApiError(400, "Ratings are only allowed after the job is completed");
  }

  // Authorization is fully server-derived and must complete, successfully,
  // before any Rating document can be created - toUserId from the client is
  // only ever compared against this derived set, never used to establish it.
  const legitimateTargets = await getLegitimateRatingTargets(job, req.user._id);

  if (legitimateTargets.size === 0) {
    throw new ApiError(403, "You are not authorized to rate this job");
  }

  if (!toUserId || toUserId.toString() === req.user._id.toString()) {
    throw new ApiError(403, "You are not authorized to rate this user for this job");
  }

  if (!legitimateTargets.has(toUserId.toString())) {
    // Deliberately the same generic message as the "not a participant" and
    // "self-rating" rejections above - this must not leak whether toUserId
    // happens to be a real user, an accepted worker on a different job, etc.
    throw new ApiError(403, "You are not authorized to rate this user for this job");
  }

  const existingRating = await Rating.findOne({
    jobId,
    fromUserId: req.user._id,
    toUserId,
  });

  if (existingRating) {
    throw new ApiError(409, "You have already rated this user for this job");
  }

  // The findOne check above is an optimization only - two concurrent
  // requests can both pass it before either inserts. Rating's unique index
  // on {jobId, fromUserId, toUserId} (rating.model.js) is the real
  // guarantee. It is the only unique index on this model, so a duplicate-key
  // error (code 11000) here can only mean that index was violated; revisit
  // this check if a second unique index is ever added. Throwing here also
  // guarantees the losing request never reaches the profile mutation below.
  let ratingDoc;
  try {
    ratingDoc = await Rating.create({
      jobId,
      fromUserId: req.user._id,
      toUserId,
      rating: score,
      review: review || "",
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "You have already rated this user for this job");
    }
    throw error;
  }

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
