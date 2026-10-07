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
import { APPLICATION_STATUS, APPLICATION_INITIATORS } from "../constants.js";

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


/**
 * THE one way an Application becomes "accepted" - used both when an employer
 * accepts a worker's application and when a worker accepts an employer's job
 * request. Extracted rather than duplicated precisely so a second hiring path
 * cannot drift away from these guarantees (the retired /offers endpoints did
 * exactly that: they called the uncapped incrementFilledWorkers and over-hired
 * a 1-worker job to filledWorkers=3).
 *
 * Capacity is claimed FIRST, by MongoDB, under the job's document lock.
 * Comparing filledWorkers against requiredWorkers in JS first could not work:
 * two acceptances for DIFFERENT applications both read the same stale count,
 * both passed, and both incremented. Exactly one concurrent caller can match
 * reserveWorkerSlot's filter; the loser is told the job is full.
 *
 * @param {object} app - the Application document (status read BEFORE any mutation)
 * @param {object} fallbackJob - the populated job, used if no slot is reserved
 * @returns {Promise<object>} the job as it stands after the reservation
 */
async function acceptApplicationAtomically(app, fallbackJob) {
  // Captured ONCE, before anything mutates it: whether we reserved a slot
  // decides whether we must hand one back, and re-reading app.status later is
  // unreliable (a concurrent request may already have changed it).
  const alreadyAccepted = app.status === APPLICATION_STATUS.ACCEPTED;

  let job = fallbackJob;
  if (!alreadyAccepted) {
    job = await reserveWorkerSlot(app.jobId._id || app.jobId);
    if (!job) {
      throw new ApiError(400, "Job has already reached its worker capacity");
    }
  }

  // Atomic conditional transition: only the request that actually moves this
  // application INTO "accepted" may keep the slot it just claimed. A repeat
  // accept (sequential or concurrent) matches nothing here, so one application
  // can never be counted twice.
  const transitioned = await Application.findOneAndUpdate(
    { _id: app._id, status: { $ne: APPLICATION_STATUS.ACCEPTED } },
    { $set: { status: APPLICATION_STATUS.ACCEPTED } },
    { returnDocument: "after" }
  );

  if (!alreadyAccepted && !transitioned) {
    // Another request accepted this same application between our read and our
    // write. Our reservation is unusable - hand it back rather than leaking a
    // slot the job can never recover.
    job = (await releaseWorkerSlot(app.jobId._id || app.jobId)) || job;
  }
  app.status = APPLICATION_STATUS.ACCEPTED;

  return job || fallbackJob;
}

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
  // in the codebase. (The deleted /offers accept-offer flow did not treat
  // "partially_assigned" as valid here either.)
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
  // A withdrawn application, or an invitation the worker declined, may be
  // revived - in both cases the worker has changed their mind and there is no
  // live relationship in the way. Any other status means one already exists.
  const REUSABLE_STATUSES = [APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.DECLINED];
  if (existingApp && !REUSABLE_STATUSES.includes(existingApp.status)) {
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
  if (existingApp && REUSABLE_STATUSES.includes(existingApp.status)) {
    existingApp.status = "applied";
    // Reviving the row makes it a worker-initiated application, whatever
    // created it originally.
    existingApp.initiatedBy = APPLICATION_INITIATORS.WORKER;
    existingApp.respondedAt = null;
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
        initiatedBy: APPLICATION_INITIATORS.WORKER,
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


// The SAME privacy boundary the worker side has (see getJobEmployerContact):
// a contact number is released only once a hiring relationship is accepted.
// Before this, GET /applications/job/:jobId handed the employer the phone number
// of EVERY applicant - including workers who had merely applied, and workers the
// employer had already rejected. Nothing in the frontend read it; it was simply
// being shipped.
const CONTACTABLE_APPLICATION_STATUSES = ["accepted", "completed"];

/**
 * Strips the worker's phone number from an application unless the relationship
 * has been accepted. The employer keeps everything they need to CHOOSE a worker
 * (name, skills, rating, match score) at every stage - only the means of
 * contacting them directly waits for the hire.
 */
const redactApplicantContact = (application) => {
  const plain = application.toObject ? application.toObject() : { ...application };
  if (CONTACTABLE_APPLICATION_STATUSES.includes(plain.status)) return plain;
  if (plain.workerId?.userId?.phone) {
    // Deleted rather than blanked, so a client cannot mistake "" for a real
    // value, and so the absence is visible rather than silent.
    delete plain.workerId.userId.phone;
  }
  return plain;
};

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

  return res
    .status(200)
    .json(
      new ApiResponse(200, applicants.map(redactApplicantContact), "Job applicants ranked by match score")
    );
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

  // The applicant is looking at their own record, so their own phone is fine;
  // an employer viewing it is subject to the same boundary as the list.
  const payload = isApplicant || isAdmin ? app : redactApplicantContact(app);

  return res.status(200).json(new ApiResponse(200, payload, "Application retrieved"));
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

    if (["rejected", "withdrawn", "completed", "declined"].includes(app.status)) {
      throw new ApiError(400, `Cannot accept an application that is ${app.status}`);
    }

    // An invitation is the employer's own request - only the WORKER may answer
    // it (POST /applications/:id/respond). Letting the employer "accept" it
    // here would be the employer hiring on the worker's behalf.
    if (app.status === APPLICATION_STATUS.INVITED) {
      throw new ApiError(400, "This is a job request you sent - the worker has to accept it");
    }

    // The single shared acceptance mechanism - see
    // acceptApplicationAtomically() above for the concurrency reasoning.
    const job = await acceptApplicationAtomically(app, app.jobId);

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
    if (["accepted", "completed", "withdrawn", "declined"].includes(app.status)) {
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

// =============================================================================
// EMPLOYER-INITIATED HIRING ("job requests")
//
// An employer picking a worker off the recommended list and a worker applying
// are the SAME relationship approached from opposite ends, so they are the same
// Application document - distinguished by `initiatedBy` and by the `invited`
// status. That is what keeps one authoritative hiring path:
//
//   * the unique {jobId, workerId} index already prevents a duplicate request
//     AND prevents a request coexisting with an application for the same pair;
//   * acceptance goes through acceptApplicationAtomically(), the same capacity
//     reservation the employer-accept path uses, so a request can never
//     over-hire a job.
//
// The previous /offers endpoints were a parallel path that did neither: they
// called the uncapped incrementFilledWorkers, and three workers accepting
// requests for a 1-worker job drove filledWorkers to 3 (measured). Those routes
// are retired - see routes/index.js.
// =============================================================================

/**
 * POST /applications/invite   (employer, owns the job)
 *
 * Sends a job request to one worker. Nothing about WHO is sending comes from
 * the request body: the employer is derived from the JWT, and the job must
 * belong to that employer's profile.
 */
export const inviteWorker = asyncHandler(async (req, res) => {
  const { jobId, workerId, proposedPay } = req.body;

  if (!isValidObjectId(jobId)) throw new ApiError(400, "Invalid Job ID format");
  if (!isValidObjectId(workerId)) throw new ApiError(400, "Invalid Worker ID format");

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  // Ownership is a filter, not a post-hoc comparison: a job the employer does
  // not own is simply not found, which also avoids confirming it exists.
  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  // Same eligibility question as recommending a worker for this job: the job
  // must still be able to take someone. "assigned"/"completed"/"cancelled"/
  // "draft"/"expired" cannot.
  if (!["open", "partially_assigned"].includes(job.status)) {
    throw new ApiError(400, `Cannot send job requests for a job that is ${job.status}`);
  }

  if (typeof job.requiredWorkers === "number" && (job.filledWorkers || 0) >= job.requiredWorkers) {
    throw new ApiError(400, "Job has already reached its worker capacity");
  }

  if (job.applicationDeadline && new Date(job.applicationDeadline).getTime() < Date.now()) {
    throw new ApiError(400, "This job's application deadline has passed");
  }

  const workerProfile = await WorkerProfile.findById(workerId);
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  // An employer must not be able to invite themselves on a dual-role account.
  if (String(workerProfile.userId) === String(req.user._id)) {
    throw new ApiError(400, "You cannot send a job request to yourself");
  }

  const existing = await Application.findOne({ jobId, workerId: workerProfile._id });
  if (existing && ![APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.DECLINED].includes(existing.status)) {
    // Deliberately specific, because the employer is entitled to know the
    // state of a relationship on their own job.
    throw new ApiError(
      409,
      existing.status === APPLICATION_STATUS.INVITED
        ? "You have already sent this worker a request for this job"
        : `This worker already has an application for this job (${existing.status})`
    );
  }

  // Scoring reuses the same AI call an application uses, so an invited worker
  // carries a real matchScore rather than the hardcoded 100 the retired
  // /offers path invented.
  const workerSkills = await WorkerSkill.find({ workerId: workerProfile._id });
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
  if (existing) {
    // Reviving a withdrawn/declined row rather than inserting a second one -
    // the unique index would reject the insert anyway.
    existing.status = APPLICATION_STATUS.INVITED;
    existing.initiatedBy = APPLICATION_INITIATORS.EMPLOYER;
    existing.respondedAt = null;
    existing.matchScore = matchScore;
    existing.matchFactors = matchFactors;
    if (proposedPay !== undefined) existing.proposedPay = proposedPay;
    application = await existing.save();
  } else {
    try {
      application = await Application.create({
        jobId,
        workerId: workerProfile._id,
        status: APPLICATION_STATUS.INVITED,
        initiatedBy: APPLICATION_INITIATORS.EMPLOYER,
        matchScore,
        matchFactors,
        ...(proposedPay !== undefined ? { proposedPay } : {}),
      });
    } catch (error) {
      // The findOne above is an optimization only - two concurrent sends can
      // both pass it. The unique {jobId, workerId} index is the real guarantee,
      // and a duplicate is a conflict, not a server fault (the retired /offers
      // path returned 500 here).
      if (error.code === 11000) {
        throw new ApiError(409, "You have already sent this worker a request for this job");
      }
      throw error;
    }
  }

  // Notification failure must never undo a request that is already persisted -
  // sendNotificationService swallows its own errors for exactly this reason.
  await sendNotificationService({
    userId: workerProfile.userId,
    type: "job_alert",
    templateKey: "JOB_ALERT",
    templateData: {
      jobTitle: job.title?.en || job.titleText || "Job",
      payAmount: application.proposedPay || job.payAmount,
      payType: job.payType,
    },
    refId: application._id,
  });

  return res.status(201).json(new ApiResponse(201, application, "Job request sent to worker"));
});

/**
 * GET /applications/invitations   (worker)
 *
 * The worker's incoming job requests. Separate from GET /applications/mine so
 * the UI can show "Job requests" as its own section without client-side
 * filtering, but it is the same collection - these ARE applications.
 */
export const getMyInvitations = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const invitations = await Application.find({
    workerId: workerProfile._id,
    initiatedBy: APPLICATION_INITIATORS.EMPLOYER,
  })
    // The worker needs enough to judge the request: the job, and who is
    // offering it. Only the employer's display name is pulled from the User -
    // contact details stay behind the gated employer-contact endpoint until
    // the request is accepted.
    .populate({
      path: "jobId",
      populate: [
        { path: "categoryId" },
        { path: "skillIds" },
        { path: "employerId", populate: { path: "userId", select: "fullName" } },
      ],
    })
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, invitations, "Job requests retrieved"));
});

/**
 * POST /applications/:applicationId/respond   (worker, own invitation)
 *
 * The worker accepts or declines a job request. Accepting goes through the SAME
 * atomic capacity reservation as an employer accepting an application, so N
 * workers accepting requests for a job with N-1 slots cannot over-hire it.
 */
export const respondToInvitation = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { response } = req.body;

  if (!["accepted", "declined"].includes(response)) {
    throw new ApiError(400, "Response must be accepted or declined");
  }

  if (!isValidObjectId(applicationId)) {
    throw new ApiError(400, "Invalid Application ID format");
  }

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const app = await Application.findById(applicationId).populate("jobId");
  if (!app) throw new ApiError(404, "Job request not found");

  // Ownership: a worker may only answer a request addressed to them. Returning
  // 404 rather than 403 keeps another worker's request unconfirmable.
  if (String(app.workerId) !== String(workerProfile._id)) {
    throw new ApiError(404, "Job request not found");
  }

  if (app.initiatedBy !== APPLICATION_INITIATORS.EMPLOYER) {
    throw new ApiError(400, "This is your own application, not a job request");
  }

  if (app.status !== APPLICATION_STATUS.INVITED) {
    throw new ApiError(400, `This job request has already been answered (${app.status})`);
  }

  const employer = await EmployerProfile.findById(app.jobId?.employerId);
  const jobTitle = app.jobId?.title?.en || app.jobId?.titleText || "Job";

  if (response === "declined") {
    // Conditional write: a concurrent accept may already have claimed a slot,
    // and a blind save() would silently discard that acceptance.
    const declined = await Application.findOneAndUpdate(
      { _id: app._id, status: APPLICATION_STATUS.INVITED },
      { $set: { status: APPLICATION_STATUS.DECLINED, respondedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!declined) throw new ApiError(409, "This job request has just been answered");

    if (employer) {
      await sendNotificationService({
        userId: employer.userId,
        type: "application_update",
        templateKey: "APPLICATION_REJECTED",
        templateData: { jobTitle },
        refId: app._id,
      });
    }

    return res.status(200).json(new ApiResponse(200, declined, "Job request declined"));
  }

  // --- accepted ---
  if (["cancelled", "completed"].includes(app.jobId?.status)) {
    throw new ApiError(400, "This job is no longer taking workers");
  }

  await acceptApplicationAtomically(app, app.jobId);
  await Application.updateOne({ _id: app._id }, { $set: { respondedAt: new Date() } });

  if (employer) {
    await sendNotificationService({
      userId: employer.userId,
      type: "application_update",
      templateKey: "APPLICATION_ACCEPTED",
      templateData: { jobTitle },
      refId: app._id,
    });
  }

  const accepted = await Application.findById(app._id).populate("jobId");
  return res.status(200).json(new ApiResponse(200, accepted, "Job request accepted"));
});
