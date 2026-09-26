import Application from "../models/application.model.js";
import Job from "../models/job.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import WorkerSkill from "../models/workerSkill.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { scoreWorkerJobPair } from "../services/aiService.client.js";
import { sendNotificationService } from "../services/notification.service.js";

export const applyForJob = asyncHandler(async (req, res) => {
  const { jobId, coverNote } = req.body;

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const job = await Job.findById(jobId);
  // Intentionally stricter than AI recommendation eligibility. The AI
  // service's candidate filter (ai-service/app/recommendation/candidates.py)
  // treats a partially_assigned job as still recommendable when it has
  // room (filled_workers < required_workers) - that's about what's worth
  // *showing* a worker. Submitting a *new application* is a different,
  // narrower question, and this is the only application-eligibility gate
  // in the codebase: no other code path (including offer.controller.js's
  // accept-offer flow) treats "partially_assigned" as valid here. Verified
  // by inspection, not assumed - left unchanged rather than widened,
  // since nothing in the existing business logic currently supports
  // accepting new applications once a job has any confirmed worker.
  if (!job || job.status !== "open") {
    throw new ApiError(400, "Job is not open for applications");
  }

  const existingApp = await Application.findOne({ jobId, workerId: workerProfile._id });
  if (existingApp && existingApp.status !== "withdrawn") {
    throw new ApiError(409, "You have already applied to this job");
  }

  const workerSkills = await WorkerSkill.find({ workerId: workerProfile._id });

  // Scoring is now the Python AI service's job, not the legacy JS matcher.
  // If the AI service can't be reached, the application must NOT be
  // created with a fabricated or fallback score - fail the request
  // instead, per the cutover's error-handling requirements.
  let matchScore;
  let matchFactors;
  try {
    const scored = await scoreWorkerJobPair({ worker: workerProfile, workerSkills, job });
    matchScore = scored.ranking.overall_score;
    matchFactors = scored.ranking.match_factors;
  } catch (error) {
    if (error.statusCode && error.statusCode < 500) {
      throw new ApiError(error.statusCode, `AI scoring service rejected the request: ${error.message}`);
    }
    throw new ApiError(503, "AI scoring service is unavailable. Please try again later.");
  }

  // matchFactors previously computed here but never actually saved -
  // persisting it now along with matchScore. Neither value is coerced:
  // matchFactors.pay/rating stay null exactly as the AI service returned
  // them, matching Application.matchFactors' non-required Number fields.
  const application = await Application.create({
    jobId,
    workerId: workerProfile._id,
    matchScore,
    matchFactors,
    status: "applied",
    coverNote: coverNote || "",
  });

  // Notify employer
  const employer = await EmployerProfile.findById(job.employerId);
  if (employer) {
    await sendNotificationService({
      userId: employer.userId,
      type: "JOB_APPLICATION",
      templateKey: "NEW_MESSAGE",
      templateData: {
        senderName: workerProfile.fullName,
        messageText: `New application for job ${job.title?.en || "Job"} with match score ${matchScore}%`,
      },
      refId: application._id,
    });
  }

  return res.status(201).json(new ApiResponse(201, { application, matchFactors }, "Application submitted successfully"));
});

export const withdrawApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });

  const app = await Application.findOneAndUpdate(
    { _id: applicationId, workerId: workerProfile._id },
    { status: "withdrawn" },
    { new: true }
  );

  if (!app) throw new ApiError(404, "Application not found");

  return res.status(200).json(new ApiResponse(200, app, "Application withdrawn"));
});

export const getMyApplications = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const applications = await Application.find({ workerId: workerProfile._id })
    .populate("jobId")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, applications, "My applications retrieved"));
});

export const getJobApplicants = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  const applicants = await Application.find({ jobId })
    .populate({
      path: "workerId",
      populate: { path: "userId", select: "phone avatar" },
    })
    .sort({ matchScore: -1, createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, applicants, "Job applicants ranked by match score"));
});

export const shortlistApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const app = await Application.findById(applicationId).populate("jobId workerId");
  if (!app) throw new ApiError(404, "Application not found");

  if (!app.jobId || app.jobId.employerId.toString() !== employerProfile._id.toString()) {
    throw new ApiError(403, "Unauthorized access to this application");
  }

  app.status = "shortlisted";
  await app.save();

  return res.status(200).json(new ApiResponse(200, app, "Application shortlisted"));
});

export const acceptOrRejectApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body; // 'accepted' or 'rejected'

  if (!["accepted", "rejected"].includes(status)) {
    throw new ApiError(400, "Status must be accepted or rejected");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const app = await Application.findById(applicationId).populate("jobId workerId");
  if (!app) throw new ApiError(404, "Application not found");

  if (!app.jobId || app.jobId.employerId.toString() !== employerProfile._id.toString()) {
    throw new ApiError(403, "Unauthorized access to this application");
  }

  app.status = status;
  await app.save();

  if (status === "accepted") {
    const job = await Job.findById(app.jobId._id);
    if (job) {
      job.filledWorkers = (job.filledWorkers || 0) + 1;
      if (job.filledWorkers >= job.requiredWorkers) {
        job.status = "assigned";
      } else {
        job.status = "partially_assigned";
      }
      await job.save();
    }

    // Notify worker
    await sendNotificationService({
      userId: app.workerId.userId,
      type: "APPLICATION_ACCEPTED",
      templateKey: "APPLICATION_ACCEPTED",
      templateData: { jobTitle: job?.title?.en || "Job" },
      refId: app._id,
    });
  }

  return res.status(200).json(new ApiResponse(200, app, `Application ${status}`));
});

export const completeApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const app = await Application.findById(applicationId).populate("jobId");
  if (!app) throw new ApiError(404, "Application not found");

  if (!app.jobId || app.jobId.employerId.toString() !== employerProfile._id.toString()) {
    throw new ApiError(403, "Unauthorized access to this application");
  }

  app.status = "completed";
  await app.save();

  return res.status(200).json(new ApiResponse(200, app, "Application marked completed"));
});
