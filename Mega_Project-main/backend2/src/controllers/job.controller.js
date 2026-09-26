import Job from "../models/job.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import WorkerSkill from "../models/workerSkill.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { translateTextToAllLanguages } from "../services/translation.service.js";
import { getPaginationParams, formatPaginatedResult } from "../utils/pagination.js";
import { pickLanguage } from "../utils/languagePicker.js";
import {
  getRecommendedJobsForWorker,
  getRecommendedWorkersForJob,
} from "../services/aiService.client.js";

// Mongoose populate() replaces a ref field with the referenced document.
// The AI service needs the raw ObjectId string instead (Job.category_id /
// Job.skill_ids / Job.employer_id are all plain string IDs on the Python
// side) - this converts a populated-or-not field back to a plain id string
// without needing a second, unpopulated query.
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
  if (error.statusCode && error.statusCode < 500) {
    return new ApiError(error.statusCode, `AI service rejected the request: ${error.message}`);
  }
  return new ApiError(503, "AI recommendation service is unavailable. Please try again later.");
};

export const createJob = asyncHandler(async (req, res) => {
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const { title, description, originalLanguage = "en", coordinates, ...jobData } = req.body;

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
    location: {
      type: "Point",
      coordinates,
    },
    status: "open",
  });

  return res.status(201).json(new ApiResponse(201, job, "Job created successfully with auto-translations"));
});

export const updateJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  const allowedUpdates = [
    "title",
    "description",
    "categoryId",
    "skillIds",
    "requiredWorkers",
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "payType",
    "payAmount",
    "genderPreference",
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

  if (req.body.coordinates && Array.isArray(req.body.coordinates) && req.body.coordinates.length === 2) {
    job.location = {
      type: "Point",
      coordinates: req.body.coordinates,
    };
  }

  await job.save();

  return res.status(200).json(new ApiResponse(200, job, "Job updated successfully"));
});

export const cancelJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });

  const job = await Job.findOneAndUpdate(
    { _id: jobId, employerId: employerProfile._id },
    { status: "cancelled" },
    { new: true }
  );

  if (!job) throw new ApiError(404, "Job not found");

  return res.status(200).json(new ApiResponse(200, job, "Job cancelled successfully"));
});

export const closeJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });

  const job = await Job.findOneAndUpdate(
    { _id: jobId, employerId: employerProfile._id },
    { status: "completed" },
    { new: true }
  );

  if (!job) throw new ApiError(404, "Job not found");

  return res.status(200).json(new ApiResponse(200, job, "Job completed and closed"));
});

export const getEmployerJobs = asyncHandler(async (req, res) => {
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const jobs = await Job.find({ employerId: employerProfile._id }).sort({ createdAt: -1 });
  return res.status(200).json(new ApiResponse(200, jobs, "Employer jobs retrieved"));
});

export const searchAndFilterJobs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const { categoryId, payType, minPay, search, status = "open" } = req.query;
  const lang = req.lang || "en";

  const queryFilter = { status };
  if (categoryId) queryFilter.categoryId = categoryId;
  if (payType) queryFilter.payType = payType;
  if (minPay) queryFilter.payAmount = { $gte: Number(minPay) };

  const [rawJobs, totalDocs] = await Promise.all([
    Job.find(queryFilter)
      .populate("categoryId skillIds employerId")
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

  // "open" alone is no longer the full eligibility picture - a
  // partially_assigned job may still need workers. The AI service's
  // candidate filter (app/recommendation/candidates.py) makes the final
  // eligibility call; Node just needs to make sure those candidates are
  // actually in the pool it sends.
  const candidateJobs = await Job.find({ status: { $in: ["open", "partially_assigned"] } })
    .populate("categoryId skillIds employerId")
    .limit(50);

  if (candidateJobs.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], "Recommended jobs retrieved"));
  }

  const jobsById = new Map(candidateJobs.map((job) => [job._id.toString(), job]));

  let aiResult;
  try {
    aiResult = await getRecommendedJobsForWorker({
      worker: workerProfile,
      workerSkills,
      jobs: candidateJobs.map(serializeJobForAi),
      topK: candidateJobs.length,
    });
  } catch (error) {
    throw wrapAiServiceError(error);
  }

  // matchScore/matchFactors come straight from the AI service's ranking -
  // Node does not compute or adjust them. Preserve whatever order the AI
  // service already returned (already sorted by overall_score).
  const scoredJobs = aiResult.matches.map((match) => ({
    job: jobsById.get(match.job_id),
    matchScore: match.ranking.overall_score,
    matchFactors: match.ranking.match_factors,
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

  // No hard filter on worker attributes here (availability, location, etc.
  // are all AI matching factors, not eligibility gates) - the AI service
  // decides match quality, Node just supplies the candidate pool.
  const candidateWorkers = await WorkerProfile.find().limit(100);

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

  const scoredWorkers = aiResult.matches.map((match) => ({
    worker: workersById.get(match.worker_id),
    matchScore: match.ranking.overall_score,
    matchFactors: match.ranking.match_factors,
  }));

  return res.status(200).json(new ApiResponse(200, scoredWorkers, "Recommended workers retrieved"));
});
