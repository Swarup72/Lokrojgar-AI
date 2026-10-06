import mongoose from "mongoose";
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
import { reserveWorkerSlot, releaseWorkerSlot } from "../utils/jobAssignment.js";

const isValidObjectId = (id) =>
  Boolean(
    id &&
      (mongoose.isValidObjectId(id) ||
        (typeof id === "string" &&
          (id.startsWith("APP") ||
            id.startsWith("JOB") ||
            id.startsWith("WORKER") ||
            id.startsWith("EMP") ||
            id.startsWith("USER"))))
  );

export const applyForJob = asyncHandler(async (req, res) => {
  const { jobId, coverNote } = req.body;

  if (!isValidObjectId(jobId)) {
    throw new ApiError(400, "Invalid Job ID format");
  }

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
  // accept-offer flow) treats "partially_assigned" as valid here.
  if (!job || job.status !== "open") {
    throw new ApiError(400, "Job is not open for applications");
  }

  if (
    typeof job.requiredWorkers === "number" &&
    (job.filledWorkers || 0) >= job.requiredWorkers
  ) {
    throw new ApiError(400, "Job has already reached its worker capacity");
  }

  if (job.applicationDeadline && new Date(job.applicationDeadline).getTime() < Date.now()) {
    throw new ApiError(400, "Job application deadline has passed");
  }

  const existingApp = await Application.findOne({ jobId, workerId: workerProfile._id });
  if (existingApp && existingApp.status !== "withdrawn") {
    throw new ApiError(409, "You have already applied to this job");
  }

  const workerSkills = await WorkerSkill.find({ workerId: workerProfile._id });

  // Scoring is the Python AI service's job. If the AI service can't be reached,
  // fail the request per the cutover's error-handling requirements.
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

  let application;
  if (existingApp && existingApp.status === "withdrawn") {
    existingApp.status = "applied";
    existingApp.matchScore = matchScore;
    existingApp.matchFactors = matchFactors;
    existingApp.appliedAt = new Date();
    if (coverNote !== undefined) existingApp.coverNote = coverNote;
    application = await existingApp.save();
  } else {
    try {
      application = await Application.create({
        jobId,
        workerId: workerProfile._id,
        matchScore,
        matchFactors,
        status: "applied",
        coverNote: coverNote || "",
      });
    } catch (error) {
      if (error.code === 11000) {
        throw new ApiError(409, "You have already applied to this job");
      }
      throw error;
    }
  }

  // Notify employer
  const employer = await EmployerProfile.findById(job.employerId);
  if (employer) {
    await sendNotificationService({
      userId: employer.userId,
      type: "application_update",
      templateKey: "NEW_MESSAGE",
      templateData: {
        senderName: workerProfile.fullName,
        messageText: `New application for job ${job.title?.en || job.titleText || "Job"} with match score ${matchScore}%`,
      },
      refId: application._id,
    });
  }

  return res
    .status(201)
    .json(new ApiResponse(201, { application, matchFactors }, "Application submitted successfully"));
});

export const withdrawApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  if (!isValidObjectId(applicationId)) {
    throw new ApiError(400, "Invalid Application ID format");
  }

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const app = await Application.findOne({ _id: applicationId, workerId: workerProfile._id });
  if (!app) throw new ApiError(404, "Application not found");

  if (app.status === "withdrawn") {
    return res.status(200).json(new ApiResponse(200, app, "Application withdrawn"));
  }

  if (app.status !== "applied" && app.status !== "shortlisted") {
    throw new ApiError(400, `Cannot withdraw an application with status "${app.status}"`);
  }

  app.status = "withdrawn";
  await app.save();

  return res.status(200).json(new ApiResponse(200, app, "Application withdrawn"));
});

export const getMyApplications = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const filter = { workerId: workerProfile._id };
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const applications = await Application.find(filter)
    .populate("jobId")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, applications, "My applications retrieved"));
});

export const getJobApplicants = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  if (!isValidObjectId(jobId)) {
    throw new ApiError(400, "Invalid Job ID format");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  const filter = { jobId };
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const applicants = await Application.find(filter)
    .populate({
      path: "workerId",
      populate: { path: "userId", select: "phone avatar" },
    })
    .sort({ matchScore: -1, createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, applicants, "Job applicants ranked by match score"));
});

export const getApplicationById = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  if (!isValidObjectId(applicationId)) {
    throw new ApiError(400, "Invalid Application ID format");
  }

  const app = await Application.findById(applicationId)
    .populate("jobId")
    .populate({
      path: "workerId",
      populate: { path: "userId", select: "phone avatar" },
    });

  if (!app) {
    throw new ApiError(404, "Application not found");
  }

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });

  const isApplicant =
    workerProfile &&
    app.workerId &&
    (app.workerId._id?.toString() === workerProfile._id.toString() ||
      app.workerId.toString() === workerProfile._id.toString());

  const isJobOwner =
    employerProfile &&
    app.jobId &&
    (app.jobId.employerId?._id?.toString() === employerProfile._id.toString() ||
      app.jobId.employerId?.toString() === employerProfile._id.toString());

  const isAdmin = req.user.role === "admin" || req.user.roles?.includes("admin");

  if (!isApplicant && !isJobOwner && !isAdmin) {
    throw new ApiError(403, "Unauthorized to view this application");
  }

  return res.status(200).json(new ApiResponse(200, app, "Application retrieved"));
});

export const shortlistApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  if (!isValidObjectId(applicationId)) {
    throw new ApiError(400, "Invalid Application ID format");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const app = await Application.findById(applicationId).populate("jobId workerId");
  if (!app) throw new ApiError(404, "Application not found");

  if (!app.jobId || app.jobId.employerId.toString() !== employerProfile._id.toString()) {
    throw new ApiError(403, "Unauthorized access to this application");
  }

  if (app.status === "shortlisted") {
    return res.status(200).json(new ApiResponse(200, app, "Application shortlisted"));
  }

  if (app.status !== "applied") {
    throw new ApiError(400, `Cannot shortlist an application with status "${app.status}"`);
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

  if (!isValidObjectId(applicationId)) {
    throw new ApiError(400, "Invalid Application ID format");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const app = await Application.findById(applicationId).populate("jobId workerId");
  if (!app) throw new ApiError(404, "Application not found");

  if (!app.jobId || app.jobId.employerId.toString() !== employerProfile._id.toString()) {
    throw new ApiError(403, "Unauthorized access to this application");
  }

  if (status === "accepted") {
    if (app.jobId.status === "cancelled" || app.jobId.status === "completed") {
      throw new ApiError(400, "Cannot accept applications for a completed or cancelled job");
    }

    if (["rejected", "withdrawn", "completed"].includes(app.status)) {
      throw new ApiError(400, `Cannot accept an application that is ${app.status}`);
    }

    // Capacity is claimed FIRST, by MongoDB, under the job's document lock.
    // Comparing filledWorkers against requiredWorkers in JS first could not
    // work: two acceptances for DIFFERENT applications both read the same
    // stale count, both passed, and both incremented - over-hiring the job.
    // Exactly one concurrent caller can match this filter; the loser gets
    // null and is told the job is full.
    // Captured ONCE, before anything mutates it: whether we reserved a slot
    // decides whether we must hand one back, and re-reading app.status later
    // is unreliable (a concurrent request may already have changed it).
    const alreadyAccepted = app.status === "accepted";

    let job = app.jobId;
    if (!alreadyAccepted) {
      job = await reserveWorkerSlot(app.jobId._id);
      if (!job) {
        throw new ApiError(400, "Job has already reached its worker capacity");
      }
    }

    // Atomic conditional transition: only the request that actually moves
    // this application INTO "accepted" may keep the slot it just claimed.
    // A repeat accept (sequential or concurrent) matches nothing here, so
    // one application can never be counted twice.
    const transitioned = await Application.findOneAndUpdate(
      { _id: app._id, status: { $ne: "accepted" } },
      { $set: { status: "accepted" } },
      { returnDocument: "after" }
    );

    if (!alreadyAccepted && !transitioned) {
      // Another request accepted this same application between our read and
      // our write. Our reservation is unusable - hand it back rather than
      // leaking a slot the job can never recover.
      job = (await releaseWorkerSlot(app.jobId._id)) || job;
    }
    app.status = "accepted";

    // Notify worker (sent on every successful accept response)
    const workerUserId = app.workerId?.userId?._id || app.workerId?.userId || app.workerId;
    if (workerUserId) {
      await sendNotificationService({
        userId: workerUserId,
        type: "application_update",
        templateKey: "APPLICATION_ACCEPTED",
        templateData: { jobTitle: (job || app.jobId)?.title?.en || (job || app.jobId)?.titleText || "Job" },
        refId: app._id,
      });
    }
  } else {
    // status === "rejected"
    if (["accepted", "completed", "withdrawn"].includes(app.status)) {
      throw new ApiError(400, `Cannot reject an application with status "${app.status}"`);
    }

    if (app.status === "rejected") {
      return res.status(200).json(new ApiResponse(200, app, "Application rejected"));
    }

    // Conditional write: app.status was read before this request started,
    // so a concurrent acceptance may already have moved it to "accepted"
    // and claimed a slot. A blind save() would overwrite that acceptance
    // and leave the job holding a filled slot with no accepted application.
    const rejected = await Application.findOneAndUpdate(
      { _id: app._id, status: { $ne: "accepted" } },
      { $set: { status: "rejected" } },
      { returnDocument: "after" }
    );
    if (!rejected) {
      throw new ApiError(409, "This application has just been accepted and can no longer be rejected");
    }
    app.status = "rejected";

    // Notify worker of rejection
    const workerUserId = app.workerId?.userId?._id || app.workerId?.userId || app.workerId;
    if (workerUserId) {
      await sendNotificationService({
        userId: workerUserId,
        type: "application_update",
        templateKey: "APPLICATION_REJECTED",
        templateData: { jobTitle: app.jobId?.title?.en || app.jobId?.titleText || "Job" },
        refId: app._id,
      });
    }
  }

  return res.status(200).json(new ApiResponse(200, app, `Application ${status}`));
});

export const completeApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  if (!isValidObjectId(applicationId)) {
    throw new ApiError(400, "Invalid Application ID format");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const app = await Application.findById(applicationId).populate("jobId");
  if (!app) throw new ApiError(404, "Application not found");

  if (!app.jobId || app.jobId.employerId.toString() !== employerProfile._id.toString()) {
    throw new ApiError(403, "Unauthorized access to this application");
  }

  if (app.status === "completed") {
    return res.status(200).json(new ApiResponse(200, app, "Application marked completed"));
  }

  if (app.status !== "accepted") {
    throw new ApiError(400, `Cannot mark an application as completed when status is "${app.status}"`);
  }

  app.status = "completed";
  await app.save();

  return res.status(200).json(new ApiResponse(200, app, "Application marked completed"));
});
