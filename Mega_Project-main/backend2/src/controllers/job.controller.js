import mongoose from "mongoose";
import Job from "../models/job.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import WorkerSkill from "../models/workerSkill.model.js";
import Application from "../models/application.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { translateTextToAllLanguages } from "../services/translation.service.js";
import { getPaginationParams, formatPaginatedResult } from "../utils/pagination.js";
import { pickLanguage } from "../utils/languagePicker.js";
import logger from "../utils/logger.js";
import {
  getRecommendedJobsForWorker,
  getRecommendedWorkersForJob,
} from "../services/aiService.client.js";
import { employerDisplayName } from "../utils/displayName.js";

// Mongoose populate() replaces a ref field with the referenced document.
// The AI service needs the raw ObjectId string instead (Job.category_id /
// Job.skill_ids / Job.employer_id are all plain string IDs on the Python
// side) - this converts a populated-or-not field back to a plain id string
// without needing a second, unpopulated query.
// Coarse Node-side eligibility pre-filter shared by BOTH recommendation
// directions so they can't drift. The AI service's candidate filter
// (ai-service/app/recommendation/candidates.py) makes the final call - e.g.
// a partially_assigned job that is already full is still excluded there.
const RECOMMENDABLE_JOB_STATUSES = ["open", "partially_assigned"];

const toIdString = (value) => {
  if (!value) return value;
  return (value._id || value).toString();
};

const serializeJobForAi = (job) => {
  const plain = job.toObject ? job.toObject() : job;
  return {
    ...plain,
    _id: toIdString(plain._id),
    employerId: toIdString(plain.employerId),
    categoryId: toIdString(plain.categoryId),
    skillIds: (plain.skillIds || []).map(toIdString),
  };
};

// AI service failures must be surfaced clearly, never silently patched over
// with a fallback score - see the AI cutover report for the reasoning.
const wrapAiServiceError = (error) => {
  if (error.isTimeout) logger.warn("AI recommendation request timed out", error.message);
  if (error.statusCode && error.statusCode < 500) {
    return new ApiError(error.statusCode, `AI service rejected the request: ${error.message}`);
  }
  return new ApiError(503, "AI recommendation service is unavailable. Please try again later.");
};

export const createJob = asyncHandler(async (req, res) => {
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const {
    title,
    description,
    originalLanguage = "en",
    coordinates,
    status = "open",
    experienceRequired,
    ...jobData
  } = req.body;

  // Auto-translate title and description into all 3 languages if single string or partial object provided
  let translatedTitle = title;
  if (typeof title === "string" || (title && (title.mr || title.hi || title.en))) {
    const rawText = typeof title === "string" ? title : title[originalLanguage] || title.en || title.mr || title.hi;
    translatedTitle = await translateTextToAllLanguages(rawText, originalLanguage);
  }

  let translatedDescription = description;
  if (typeof description === "string" || (description && (description.mr || description.hi || description.en))) {
    const rawDesc = typeof description === "string" ? description : description[originalLanguage] || description.en || description.mr || description.hi;
    translatedDescription = await translateTextToAllLanguages(rawDesc, originalLanguage);
  }

  const job = await Job.create({
    ...jobData,
    employerId: employerProfile._id,
    title: translatedTitle,
    description: translatedDescription,
    originalLanguage,
    experienceRequired: experienceRequired !== undefined ? experienceRequired : 0,
    location: {
      type: "Point",
      coordinates,
    },
    status: ["open", "draft"].includes(status) ? status : "open",
  });

  return res.status(201).json(new ApiResponse(201, job, "Job created successfully with auto-translations"));
});

const isValidJobId = (id) =>
  Boolean(id && (mongoose.isValidObjectId(id) || (typeof id === "string" && id.startsWith("JOB"))));

export const getJobById = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    throw new ApiError(400, "Invalid job ID");
  }

  // employerId.userId.fullName is pulled in so an employer who hires under
  // their own name (no businessName) still has a name to display. ONLY the
  // name is selected: phone/contact stays behind the gated
  // GET /jobs/:jobId/employer-contact endpoint.
  const job = await Job.findById(jobId)
    .populate("categoryId skillIds")
    .populate({ path: "employerId", populate: { path: "userId", select: "fullName" } });
  if (!job) throw new ApiError(404, "Job not found");

  let isOwner = false;
  if (req.user) {
    const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
    if (employerProfile) {
      const jobEmployerId = job.employerId?._id
        ? job.employerId._id.toString()
        : job.employerId?.toString();
      if (jobEmployerId === employerProfile._id.toString()) {
        isOwner = true;
      }
    }
    if (req.user.roles?.includes("admin")) {
      isOwner = true;
    }
  }

  // Draft jobs are private to the creator
  if (job.status === "draft" && !isOwner) {
    throw new ApiError(404, "Job not found");
  }

  const lang = req.lang || req.query.lang || "en";
  const localizedJob = {
    ...job.toObject(),
    titleText: pickLanguage(job.title, lang, job.originalLanguage),
    descriptionText: pickLanguage(job.description, lang, job.originalLanguage),
    isOwner,
  };

  return res.status(200).json(new ApiResponse(200, localizedJob, "Job retrieved successfully"));
});

export const updateJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    throw new ApiError(400, "Invalid job ID");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  if (job.status === "cancelled" || job.status === "completed") {
    throw new ApiError(
      400,
      `Cannot edit a ${job.status} job. Please reopen the job first if allowed.`
    );
  }

  if (req.body.requiredWorkers !== undefined) {
    if (req.body.requiredWorkers < (job.filledWorkers || 0)) {
      throw new ApiError(
        400,
        `Required workers cannot be less than already filled workers (${job.filledWorkers})`
      );
    }
    job.requiredWorkers = req.body.requiredWorkers;
    if (job.status === "assigned" && job.requiredWorkers > job.filledWorkers) {
      job.status = "partially_assigned";
    } else if (job.status === "partially_assigned" && job.requiredWorkers <= job.filledWorkers) {
      job.status = "assigned";
    }
  }

  const allowedUpdates = [
    "categoryId",
    "skillIds",
    "startDate",
    "applicationDeadline",
    "startTime",
    "endTime",
    "shiftType",
    "payType",
    "payAmount",
    "experienceRequired",
    "preferredLanguages",
    "city",
    "village",
    "address",
    "originalLanguage",
  ];

  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      job[field] = req.body[field];
    }
  });

  if (req.body.title !== undefined) {
    const { title } = req.body;
    const origLang = job.originalLanguage || "en";
    if (typeof title === "string" || (title && (title.mr || title.hi || title.en))) {
      const rawText = typeof title === "string" ? title : title[origLang] || title.en || title.mr || title.hi;
      job.title = await translateTextToAllLanguages(rawText, origLang);
    } else if (title && typeof title === "object") {
      job.title = { ...job.title, ...title };
    }
  }

  if (req.body.description !== undefined) {
    const { description } = req.body;
    const origLang = job.originalLanguage || "en";
    if (typeof description === "string" || (description && (description.mr || description.hi || description.en))) {
      const rawDesc = typeof description === "string" ? description : description[origLang] || description.en || description.mr || description.hi;
      job.description = await translateTextToAllLanguages(rawDesc, origLang);
    } else if (description && typeof description === "object") {
      job.description = { ...job.description, ...description };
    }
  }

  if (req.body.coordinates && Array.isArray(req.body.coordinates) && req.body.coordinates.length === 2) {
    job.location = {
      type: "Point",
      coordinates: req.body.coordinates,
    };
  }

  if (req.body.status && ["open", "draft"].includes(req.body.status) && job.status === "draft") {
    job.status = req.body.status;
  }

  await job.save();

  return res.status(200).json(new ApiResponse(200, job, "Job updated successfully"));
});

export const cancelJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    throw new ApiError(400, "Invalid job ID");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  if (job.status === "cancelled") {
    throw new ApiError(400, "Job is already cancelled");
  }
  if (job.status === "completed") {
    throw new ApiError(400, "Completed jobs cannot be cancelled");
  }

  job.status = "cancelled";
  await job.save();

  return res.status(200).json(new ApiResponse(200, job, "Job cancelled successfully"));
});

export const closeJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    throw new ApiError(400, "Invalid job ID");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  if (job.status === "completed") {
    throw new ApiError(400, "Job is already closed");
  }
  if (job.status === "cancelled") {
    throw new ApiError(400, "Cannot close a cancelled job");
  }

  job.status = "completed";
  await job.save();

  return res.status(200).json(new ApiResponse(200, job, "Job completed and closed"));
});

export const reopenJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    throw new ApiError(400, "Invalid job ID");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  if (job.status === "open" || job.status === "partially_assigned") {
    throw new ApiError(400, "Job is already active");
  }
  if (job.status === "draft") {
    throw new ApiError(400, "Draft jobs should be published, not reopened");
  }

  if (req.body?.requiredWorkers !== undefined) {
    if (req.body.requiredWorkers <= (job.filledWorkers || 0)) {
      throw new ApiError(
        400,
        `Required workers must be greater than already filled workers (${job.filledWorkers}) to reopen`
      );
    }
    job.requiredWorkers = req.body.requiredWorkers;
  } else if ((job.filledWorkers || 0) >= (job.requiredWorkers || 1)) {
    throw new ApiError(
      400,
      "Cannot reopen a job that has already filled all worker slots. Please increase required workers first."
    );
  }

  if (req.body?.startDate) {
    job.startDate = new Date(req.body.startDate);
  }
  if (req.body?.applicationDeadline !== undefined) {
    job.applicationDeadline = req.body.applicationDeadline
      ? new Date(req.body.applicationDeadline)
      : null;
  }

  if (job.applicationDeadline && new Date(job.applicationDeadline).getTime() < Date.now()) {
    throw new ApiError(
      400,
      "Application deadline has passed. Please provide a new future deadline to reopen the job."
    );
  }

  const filled = job.filledWorkers || 0;
  job.status = filled > 0 ? "partially_assigned" : "open";
  await job.save();

  return res.status(200).json(new ApiResponse(200, job, "Job reopened successfully"));
});

export const deleteJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    throw new ApiError(400, "Invalid job ID");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  const hasApplications = await Application.exists({ jobId: job._id });
  if (hasApplications) {
    throw new ApiError(
      400,
      "Cannot delete job with existing applications. Please cancel the job instead."
    );
  }

  if ((job.filledWorkers || 0) > 0) {
    throw new ApiError(
      400,
      "Cannot delete job with assigned workers. Please cancel the job instead."
    );
  }

  await Job.deleteOne({ _id: job._id });

  return res.status(200).json(new ApiResponse(200, { _id: jobId }, "Job deleted successfully"));
});

// `next` is threaded through to the delegated handlers deliberately. Each of
// them is asyncHandler-wrapped, so on failure it calls next(err); invoking
// them as closeJob(req, res) left next undefined, and the resulting
// "TypeError: next is not a function" escaped as an unhandledRejection,
// which index.js treats as fatal and shuts the server down. A single
// repeated status change could therefore take the whole process offline.
export const updateJobStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  if (status === "completed") {
    return closeJob(req, res, next);
  }
  if (status === "cancelled") {
    return cancelJob(req, res, next);
  }
  if (status === "open" || status === "partially_assigned") {
    const { jobId } = req.params;
    if (!isValidJobId(jobId)) {
      throw new ApiError(400, "Invalid job ID");
    }
    const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
    if (!employerProfile) throw new ApiError(404, "Employer profile not found");

    const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
    if (!job) throw new ApiError(404, "Job not found or unauthorized");

    if (job.status === "draft") {
      job.status = "open";
      await job.save();
      return res.status(200).json(new ApiResponse(200, job, "Draft published successfully"));
    }
    return reopenJob(req, res, next);
  }
  throw new ApiError(400, `Unsupported status transition to '${status}'`);
});

export const getEmployerJobs = asyncHandler(async (req, res) => {
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const jobs = await Job.find({ employerId: employerProfile._id })
    .populate("categoryId skillIds")
    .sort({ createdAt: -1 });
  return res.status(200).json(new ApiResponse(200, jobs, "Employer jobs retrieved"));
});

export const searchAndFilterJobs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const { categoryId, payType, minPay, search, status = "open" } = req.query;
  const lang = req.lang || "en";

  // /jobs/search is public and unauthenticated. `status` came straight from
  // the query string, so ?status=draft listed every employer's unpublished
  // drafts to anyone. Drafts are private to their owner (see getJobById),
  // and this endpoint has no way to establish ownership, so it must never
  // serve them. Other statuses describe jobs that were published at some
  // point and stay publicly listable.
  if (status === "draft") {
    throw new ApiError(400, "Draft jobs are private and cannot be listed");
  }

  const queryFilter = { status };
  if (categoryId) queryFilter.categoryId = categoryId;
  if (payType) queryFilter.payType = payType;
  if (minPay) queryFilter.payAmount = { $gte: Number(minPay) };

  const [rawJobs, totalDocs] = await Promise.all([
    Job.find(queryFilter)
      .populate("categoryId skillIds")
      .populate({ path: "employerId", populate: { path: "userId", select: "fullName" } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Job.countDocuments(queryFilter),
  ]);

  const localizedJobs = rawJobs.map((j) => ({
    ...j.toObject(),
    titleText: pickLanguage(j.title, lang, j.originalLanguage),
    descriptionText: pickLanguage(j.description, lang, j.originalLanguage),
  }));

  const result = formatPaginatedResult({ docs: localizedJobs, totalDocs, page, limit });
  return res.status(200).json(new ApiResponse(200, result, "Jobs search results"));
});

export const getNearbyJobs = asyncHandler(async (req, res) => {
  const { longitude, latitude, radiusKm = 20 } = req.query;
  const lng = Number(longitude);
  const lat = Number(latitude);
  const radiusInMeters = Number(radiusKm) * 1000;

  if (isNaN(lng) || isNaN(lat)) {
    throw new ApiError(400, "Valid longitude and latitude are required");
  }

  const nearbyJobs = await Job.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        maxDistance: radiusInMeters,
        query: { status: "open" },
        spherical: true,
      },
    },
    { $limit: 50 },
  ]);

  return res.status(200).json(new ApiResponse(200, nearbyJobs, "Nearby jobs retrieved"));
});

export const getRecommendedJobs = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const workerSkills = await WorkerSkill.find({ workerId: workerProfile._id });

  // A job this worker has already applied for, or already been invited to,
  // belongs in My Applications / Job Requests - not back in the public
  // recommendation list, where it reads as a fresh opportunity and invites a
  // duplicate application the unique {jobId, workerId} index would reject.
  const engagedJobIds = await Application.distinct("jobId", { workerId: workerProfile._id });

  const candidateFilter = { status: { $in: RECOMMENDABLE_JOB_STATUSES } };
  if (engagedJobIds?.length) candidateFilter._id = { $nin: engagedJobIds };

  // "open" alone is no longer the full eligibility picture - a
  // partially_assigned job may still need workers. The AI service's
  // candidate filter (app/recommendation/candidates.py) makes the final
  // eligibility call; Node just needs to make sure those candidates are
  // actually in the pool it sends.
  const candidateJobs = await Job.find(candidateFilter)
    .populate("categoryId skillIds")
    .populate({ path: "employerId", populate: { path: "userId", select: "fullName" } })
    .limit(50);

  // A single account may hold BOTH a WorkerProfile and an EmployerProfile.
  // Without this, such a user was recommended their own adverts: the same job
  // appeared on their employer dashboard AND under "Recommended Jobs for You".
  //
  // Done here rather than in the query because the candidate lookup already
  // populates employerId.userId, so the owner is known without a second
  // round trip. It is still a SERVER-side exclusion - an own job is dropped
  // before scoring and never reaches the client.
  //
  // Per request, never global: the job stays fully visible and recommendable
  // to every other worker. A job whose owner cannot be resolved is KEPT, so a
  // populate failure can never silently empty someone's recommendations.
  const requestingUserId = String(req.user._id);
  const eligibleJobs = candidateJobs.filter(
    (job) => String(job.employerId?.userId?._id ?? "") !== requestingUserId
  );

  if (eligibleJobs.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], "Recommended jobs retrieved"));
  }

  const candidateJobsForAi = eligibleJobs;
  const jobsById = new Map(candidateJobsForAi.map((job) => [job._id.toString(), job]));

  let aiResult;
  try {
    aiResult = await getRecommendedJobsForWorker({
      worker: workerProfile,
      workerSkills,
      jobs: candidateJobsForAi.map(serializeJobForAi),
      topK: candidateJobsForAi.length,
    });
  } catch (error) {
    throw wrapAiServiceError(error);
  }

  // matchScore/matchFactors come straight from the AI service's ranking -
  // Node does not compute or adjust them. Preserve whatever order the AI
  // service already returned (already sorted by overall_score).
  // Drop any match whose job_id is not one Node actually sent. It cannot
  // happen with the current AI service (it only ever scores the candidates
  // it was given), but if it ever did, the entry would reach React with no
  // `job` at all and crash the dashboard on match.job._id. Scores and order
  // are untouched - an unresolvable entry is simply not shown.
  const scoredJobs = aiResult.matches
    .filter((match) => {
      if (jobsById.has(match.job_id)) return true;
      logger.warn("AI returned a job_id that was not in the candidate set; dropping it", match.job_id);
      return false;
    })
    .map((match) => ({
      job: jobsById.get(match.job_id),
      matchScore: match.ranking.overall_score,
      matchFactors: match.ranking.match_factors,
      explanation: match.explanation,
    }));

  return res.status(200).json(new ApiResponse(200, scoredJobs, "Recommended jobs retrieved"));
});

export const getRecommendedWorkers = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id }).populate(
    "categoryId skillIds employerId"
  );
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  // Same eligibility pre-filter the worker->jobs direction applies to its
  // candidate jobs. An ineligible job (draft/assigned/completed/cancelled/
  // expired) gets the same empty result an ineligible job produces in the
  // other direction, without calling the AI service at all. Checked after
  // the ownership lookup, so a non-owner still gets the existing 404.
  // A missing status falls back to "open" - the default both the Mongoose
  // Job schema and the AI service's Job model declare - so Node and Python
  // agree even on that (in practice unreachable) input.
  if (!RECOMMENDABLE_JOB_STATUSES.includes(job.status ?? "open")) {
    return res
      .status(200)
      .json(new ApiResponse(200, [], "Job is not open, so no workers are recommended for it"));
  }

  // No hard filter on worker attributes here (availability, location, etc.
  // are all AI matching factors, not eligibility gates) - the AI service
  // decides match quality, Node just supplies the candidate pool.
  //
  // The mirror of the worker-side exclusion: a dual-role account must not be
  // recommended to itself as a candidate for its own advert. WorkerProfile
  // carries userId, so this costs no extra query - the requesting user is
  // excluded in the candidate lookup itself.
  const candidateWorkers = await WorkerProfile.find({ userId: { $ne: req.user._id } }).limit(100);

  if (candidateWorkers.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], "Recommended workers retrieved"));
  }

  const workerIds = candidateWorkers.map((worker) => worker._id);
  const workerSkills = await WorkerSkill.find({ workerId: { $in: workerIds } });
  const workersById = new Map(candidateWorkers.map((worker) => [worker._id.toString(), worker]));

  let aiResult;
  try {
    aiResult = await getRecommendedWorkersForJob({
      job: serializeJobForAi(job),
      workers: candidateWorkers,
      workerSkills,
      topK: candidateWorkers.length,
    });
  } catch (error) {
    throw wrapAiServiceError(error);
  }

  // Same guard as the worker->jobs direction: a worker_id Node never sent
  // would reach React with no `worker` and crash the candidate list.
  const scoredWorkers = aiResult.matches
    .filter((match) => {
      if (workersById.has(match.worker_id)) return true;
      logger.warn("AI returned a worker_id that was not in the candidate set; dropping it", match.worker_id);
      return false;
    })
    .map((match) => ({
      worker: workersById.get(match.worker_id),
      matchScore: match.ranking.overall_score,
      matchFactors: match.ranking.match_factors,
      explanation: match.explanation,
    }));

  return res.status(200).json(new ApiResponse(200, scoredWorkers, "Recommended workers retrieved"));
});

/**
 * GET /jobs/:jobId/employer-contact   (authenticated worker)
 *
 * The employer's contact details for one job, released only once a hiring
 * relationship exists.
 *
 * PRIVACY BOUNDARY (deliberate, and the reason this is a separate endpoint):
 *
 *   BEFORE a request/application is accepted, a worker already sees, from the
 *   ordinary public job read: the employer's display name, the job's city and
 *   address, and the job's coordinates - enough to judge and navigate to the
 *   work. No phone number.
 *
 *   AFTER acceptance (status "accepted" or "completed"), they additionally see
 *   the employer's phone number and the employer's own city/location, because
 *   they now need to reach the person they are working for.
 *
 * Only the fields a worker needs are selected. The employer's password hash,
 * verification flags, fraud score and every other account field are never
 * loaded, let alone returned.
 */
export const getJobEmployerContact = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    throw new ApiError(400, "Invalid job ID");
  }

  const job = await Job.findById(jobId);
  if (!job) throw new ApiError(404, "Job not found");

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  // The relationship is read from the database, never from the request. Both
  // "accepted" and "completed" qualify: finishing the work must not withdraw
  // the contact details of the person who still owes you for it.
  const relationship = await Application.findOne({
    jobId: job._id,
    workerId: workerProfile._id,
    status: { $in: ["accepted", "completed"] },
  });

  if (!relationship) {
    throw new ApiError(
      403,
      "Contact details become available once your application or job request is accepted"
    );
  }

  const employerProfile = await EmployerProfile.findById(job.employerId).populate(
    "userId",
    // The phone is the point of this endpoint; fullName is the display-name
    // fallback for an employer with no business name. Nothing else.
    "phone fullName"
  );
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        employerName: employerDisplayName(employerProfile, employerProfile.userId),
        businessName: employerProfile.businessName || null,
        businessType: employerProfile.businessType || null,
        phone: employerProfile.userId?.phone || null,
        city: employerProfile.city || null,
        village: employerProfile.village || null,
        // The EMPLOYER's own location, which is not necessarily the job site -
        // the job's own coordinates stay on the job. Kept distinct on purpose.
        employerLocation: employerProfile.location || null,
        isVerified: Boolean(employerProfile.isVerified),
      },
      "Employer contact details retrieved"
    )
  );
});
