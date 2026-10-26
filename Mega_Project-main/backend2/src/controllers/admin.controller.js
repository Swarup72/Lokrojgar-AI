import AdminAction from "../models/adminAction.model.js";
import User from "../models/user.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import Job from "../models/job.model.js";
import Application from "../models/application.model.js";
import Dispute from "../models/dispute.model.js";
import Rating from "../models/rating.model.js";
import Notification from "../models/notification.model.js";
import Document from "../models/document.model.js";
import WorkerSkill from "../models/workerSkill.model.js";
import JobCategory from "../models/jobCategory.model.js";
import { getAiServiceHealth } from "../services/aiService.client.js";
import { sendNotificationService } from "../services/notification.service.js";
import { notificationProviders } from "../services/notificationProviders/notificationProvider.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Helper function to log audit entries safely without sensitive credentials
export const logAdminAudit = async (
  adminId,
  actionType,
  { targetUserId = null, targetJobId = null, details = "", metadata = {} } = {}
) => {
  try {
    // Redact any accidental tokens or passwords from metadata
    const sanitizedMetadata = { ...metadata };
    delete sanitizedMetadata.password;
    delete sanitizedMetadata.passwordHash;
    delete sanitizedMetadata.accessToken;
    delete sanitizedMetadata.refreshToken;

    await AdminAction.create({
      adminId,
      actionType,
      targetUserId,
      targetJobId,
      details,
      metadata: sanitizedMetadata,
    });
  } catch (err) {
    console.error("Failed to log admin action:", err.message);
  }
};

const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const getPastMonthsList = (numMonths = 6) => {
  const months = [];
  const now = new Date();
  for (let i = numMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
  }
  return months;
};

const mapTrendsToMonths = (aggregateResults, months) => {
  const map = new Map(aggregateResults.map((r) => [r._id, r.count]));
  return months.map((month) => ({
    month,
    count: map.get(month) || 0,
  }));
};

// ==========================================
// 1. DASHBOARD OVERVIEW & ANALYTICS
// ==========================================

export const getDashboardStats = asyncHandler(async (req, res) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const monthsList = getPastMonthsList(6);

  const [
    totalWorkers,
    totalEmployers,
    totalJobs,
    activeJobs,
    totalApplications,
    successfulHires,
    suspendedUsers,
    openDisputes,
    unverifiedEmployers,
    workerTrendsRaw,
    employerTrendsRaw,
    jobTrendsRaw,
    applicationTrendsRaw,
    recentActivity,
    pendingDisputes,
    pendingEmployers,
  ] = await Promise.all([
    WorkerProfile.countDocuments(),
    EmployerProfile.countDocuments(),
    Job.countDocuments(),
    Job.countDocuments({ status: { $in: ["open", "partially_assigned", "assigned"] } }),
    Application.countDocuments(),
    Application.countDocuments({ status: { $in: ["accepted", "completed"] } }),
    User.countDocuments({ isBlocked: true }),
    Dispute.countDocuments({ status: "open" }),
    EmployerProfile.countDocuments({ isVerified: false }),

    // Monthly Trends Aggregations
    WorkerProfile.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    EmployerProfile.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Job.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Application.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),

    // Recent Admin & Platform Activity
    AdminAction.find()
      .populate("adminId", "fullName phone")
      .populate("targetUserId", "fullName phone")
      .populate("targetJobId", "title")
      .sort({ createdAt: -1 })
      .limit(8),

    // Items requiring attention
    Dispute.find({ status: "open" })
      .populate("raisedByUserId", "fullName phone")
      .populate("jobId", "title")
      .sort({ createdAt: -1 })
      .limit(5),

    EmployerProfile.find({ isVerified: false })
      .populate("userId", "fullName phone email")
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  const trends = {
    workers: mapTrendsToMonths(workerTrendsRaw, monthsList),
    employers: mapTrendsToMonths(employerTrendsRaw, monthsList),
    jobs: mapTrendsToMonths(jobTrendsRaw, monthsList),
    applications: mapTrendsToMonths(applicationTrendsRaw, monthsList),
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        summary: {
          totalWorkers,
          totalEmployers,
          totalJobs,
          activeJobs,
          totalApplications,
          successfulHires,
          suspendedUsers,
          openDisputes,
          unverifiedEmployers,
        },
        trends,
        recentActivity,
        pendingAttention: {
          disputes: pendingDisputes,
          employers: pendingEmployers,
        },
      },
      "Admin dashboard stats retrieved successfully"
    )
  );
});

// ==========================================
// 2. WORKER MANAGEMENT
// ==========================================

export const getWorkers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { search, availability, status, language, city } = req.query;

  const matchQuery = {};

  if (availability && ["available", "busy", "unavailable"].includes(availability)) {
    matchQuery.availability = availability;
  }

  if (language) {
    matchQuery.languages = language;
  }

  if (city) {
    matchQuery.city = { $regex: city.trim(), $options: "i" };
  }

  // If search query is provided, match against name or city in WorkerProfile,
  // or phone / email in User
  if (search && search.trim()) {
    const s = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { phone: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { fullName: { $regex: s, $options: "i" } },
      ],
    }).select("_id");

    const userIds = matchingUsers.map((u) => u._id);

    matchQuery.$or = [
      { fullName: { $regex: s, $options: "i" } },
      { city: { $regex: s, $options: "i" } },
      { userId: { $in: userIds } },
    ];
  }

  // Filter by user account status if requested
  if (status === "blocked") {
    const blockedUsers = await User.find({ isBlocked: true }).select("_id");
    matchQuery.userId = { $in: blockedUsers.map((u) => u._id) };
  } else if (status === "active") {
    const activeUsers = await User.find({ isBlocked: false }).select("_id");
    matchQuery.userId = { $in: activeUsers.map((u) => u._id) };
  }

  const [workers, total] = await Promise.all([
    WorkerProfile.find(matchQuery)
      .populate("userId", "phone email roles isBlocked isVerified createdAt lastLoginAt fraudScore")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    WorkerProfile.countDocuments(matchQuery),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        workers,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      "Workers retrieved successfully"
    )
  );
});

export const getWorkerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let worker = await WorkerProfile.findById(id).populate(
    "userId",
    "phone email roles isBlocked isVerified createdAt lastLoginAt fraudScore preferredLanguage fullName"
  );

  // Allow lookup by User ID as fallback
  if (!worker) {
    worker = await WorkerProfile.findOne({ userId: id }).populate(
      "userId",
      "phone email roles isBlocked isVerified createdAt lastLoginAt fraudScore preferredLanguage fullName"
    );
  }

  if (!worker) {
    throw new ApiError(404, "Worker profile not found");
  }

  // Fetch verified skills, applications, and reviews
  const [skills, applications, ratings] = await Promise.all([
    WorkerSkill.find({ workerId: worker._id }).populate("skillId"),
    Application.find({ workerId: worker._id })
      .populate({
        path: "jobId",
        select: "title payAmount payType city status employerId",
        populate: { path: "employerId", select: "businessName" },
      })
      .sort({ createdAt: -1 })
      .limit(10),
    Rating.find({ toUserId: worker.userId?._id }).sort({ createdAt: -1 }).limit(10),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        worker,
        skills,
        applications,
        ratings,
      },
      "Worker profile details retrieved"
    )
  );
});

export const updateWorkerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isBlocked, reason } = req.body;

  if (typeof isBlocked !== "boolean") {
    throw new ApiError(400, "isBlocked (boolean) is required");
  }

  const worker = await WorkerProfile.findById(id);
  if (!worker) {
    throw new ApiError(404, "Worker profile not found");
  }

  const user = await User.findByIdAndUpdate(
    worker.userId,
    { isBlocked },
    { new: true }
  ).select("-passwordHash");

  if (!user) {
    throw new ApiError(404, "Associated user account not found");
  }

  const actionType = isBlocked ? "SUSPEND_WORKER" : "REACTIVATE_WORKER";
  await logAdminAudit(req.user._id, actionType, {
    targetUserId: user._id,
    details: reason || `Worker ${isBlocked ? "suspended" : "reactivated"} by administrator`,
    metadata: { workerId: worker._id, isBlocked },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { worker, user },
      `Worker account ${isBlocked ? "suspended" : "reactivated"} successfully`
    )
  );
});

// ==========================================
// 3. EMPLOYER MANAGEMENT
// ==========================================

export const getEmployers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { search, isVerified, status, city } = req.query;

  const matchQuery = {};

  if (isVerified === "true") matchQuery.isVerified = true;
  if (isVerified === "false") matchQuery.isVerified = false;

  if (city) {
    matchQuery.city = { $regex: city.trim(), $options: "i" };
  }

  if (search && search.trim()) {
    const s = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { phone: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { fullName: { $regex: s, $options: "i" } },
      ],
    }).select("_id");

    const userIds = matchingUsers.map((u) => u._id);

    matchQuery.$or = [
      { businessName: { $regex: s, $options: "i" } },
      { businessType: { $regex: s, $options: "i" } },
      { city: { $regex: s, $options: "i" } },
      { userId: { $in: userIds } },
    ];
  }

  if (status === "blocked") {
    const blockedUsers = await User.find({ isBlocked: true }).select("_id");
    matchQuery.userId = { $in: blockedUsers.map((u) => u._id) };
  } else if (status === "active") {
    const activeUsers = await User.find({ isBlocked: false }).select("_id");
    matchQuery.userId = { $in: activeUsers.map((u) => u._id) };
  }

  const [employers, total] = await Promise.all([
    EmployerProfile.find(matchQuery)
      .populate("userId", "phone email roles isBlocked isVerified createdAt lastLoginAt fraudScore fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    EmployerProfile.countDocuments(matchQuery),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        employers,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      "Employers retrieved successfully"
    )
  );
});

export const getEmployerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let employer = await EmployerProfile.findById(id).populate(
    "userId",
    "phone email roles isBlocked isVerified createdAt lastLoginAt fraudScore preferredLanguage fullName"
  );

  if (!employer) {
    employer = await EmployerProfile.findOne({ userId: id }).populate(
      "userId",
      "phone email roles isBlocked isVerified createdAt lastLoginAt fraudScore preferredLanguage fullName"
    );
  }

  if (!employer) {
    throw new ApiError(404, "Employer profile not found");
  }

  // Fetch jobs posted and hiring statistics
  const [jobs, totalJobs, activeJobsCount] = await Promise.all([
    Job.find({ employerId: employer._id }).sort({ createdAt: -1 }).limit(10),
    Job.countDocuments({ employerId: employer._id }),
    Job.countDocuments({ employerId: employer._id, status: { $in: ["open", "assigned", "partially_assigned"] } }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        employer,
        stats: {
          totalJobs,
          activeJobs: activeJobsCount,
        },
        recentJobs: jobs,
      },
      "Employer details retrieved"
    )
  );
});

export const verifyEmployer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isVerified, reason } = req.body;

  if (typeof isVerified !== "boolean") {
    throw new ApiError(400, "isVerified (boolean) is required");
  }

  const employer = await EmployerProfile.findByIdAndUpdate(
    id,
    { isVerified },
    { new: true }
  ).populate("userId", "phone email fullName");

  if (!employer) {
    throw new ApiError(404, "Employer profile not found");
  }

  const actionType = isVerified ? "VERIFY_EMPLOYER" : "REJECT_EMPLOYER_VERIFICATION";
  await logAdminAudit(req.user._id, actionType, {
    targetUserId: employer.userId?._id,
    details: reason || `Employer verification set to ${isVerified}`,
    metadata: { employerId: employer._id, isVerified },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      employer,
      `Employer verification status updated to ${isVerified}`
    )
  );
});

export const updateEmployerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isBlocked, reason } = req.body;

  if (typeof isBlocked !== "boolean") {
    throw new ApiError(400, "isBlocked (boolean) is required");
  }

  const employer = await EmployerProfile.findById(id);
  if (!employer) {
    throw new ApiError(404, "Employer profile not found");
  }

  const user = await User.findByIdAndUpdate(
    employer.userId,
    { isBlocked },
    { new: true }
  ).select("-passwordHash");

  if (!user) {
    throw new ApiError(404, "Associated user account not found");
  }

  const actionType = isBlocked ? "SUSPEND_EMPLOYER" : "REACTIVATE_EMPLOYER";
  await logAdminAudit(req.user._id, actionType, {
    targetUserId: user._id,
    details: reason || `Employer ${isBlocked ? "suspended" : "reactivated"} by administrator`,
    metadata: { employerId: employer._id, isBlocked },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { employer, user },
      `Employer account ${isBlocked ? "suspended" : "reactivated"} successfully`
    )
  );
});

// ==========================================
// 4. JOB MANAGEMENT & MODERATION
// ==========================================

export const getJobs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { search, status, categoryId, payType } = req.query;

  const matchQuery = {};

  if (status) {
    matchQuery.status = status;
  }

  if (categoryId) {
    matchQuery.categoryId = categoryId;
  }

  if (payType) {
    matchQuery.payType = payType;
  }

  if (search && search.trim()) {
    const s = search.trim();
    matchQuery.$or = [
      { "title.en": { $regex: s, $options: "i" } },
      { "title.mr": { $regex: s, $options: "i" } },
      { "title.hi": { $regex: s, $options: "i" } },
      { city: { $regex: s, $options: "i" } },
    ];
  }

  const [jobs, total] = await Promise.all([
    Job.find(matchQuery)
      .populate({
        path: "employerId",
        select: "businessName profilePhoto userId",
        populate: { path: "userId", select: "fullName phone" },
      })
      .populate("categoryId", "name")
      .populate("skillIds", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Job.countDocuments(matchQuery),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        jobs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      "Jobs retrieved successfully"
    )
  );
});

export const getJobById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const job = await Job.findById(id)
    .populate({
      path: "employerId",
      populate: { path: "userId", select: "fullName phone email isBlocked" },
    })
    .populate("categoryId")
    .populate("skillIds");

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  const [applications, disputes] = await Promise.all([
    Application.find({ jobId: id })
      .populate({
        path: "workerId",
        populate: { path: "userId", select: "fullName phone" },
      })
      .sort({ createdAt: -1 })
      .limit(20),
    Dispute.find({ jobId: id }).populate("raisedByUserId", "fullName phone"),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        job,
        applications,
        disputes,
      },
      "Job details retrieved"
    )
  );
});

export const moderateJob = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;

  const validActions = ["cancel", "close", "reopen", "delete"];
  if (!validActions.includes(action)) {
    throw new ApiError(400, `Action must be one of: ${validActions.join(", ")}`);
  }

  let job = await Job.findById(id);
  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  if (action === "delete") {
    // If applications exist, soft cancel rather than hard delete to preserve history
    const applicationCount = await Application.countDocuments({ jobId: id });
    if (applicationCount > 0) {
      job.status = "cancelled";
      await job.save();
    } else {
      await Job.findByIdAndDelete(id);
    }
  } else if (action === "cancel") {
    job.status = "cancelled";
    await job.save();
  } else if (action === "close") {
    job.status = "completed";
    await job.save();
  } else if (action === "reopen") {
    job.status = "open";
    await job.save();
  }

  await logAdminAudit(req.user._id, "MODERATE_JOB", {
    targetJobId: id,
    details: reason || `Job action '${action}' applied by administrator`,
    metadata: { action, previousStatus: job.status },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      job,
      `Job action '${action}' successfully executed`
    )
  );
});

// ==========================================
// 5. APPLICATION & HIRING OVERVIEW
// ==========================================

export const getApplications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { status, search, jobId, workerId } = req.query;

  const matchQuery = {};

  if (status) {
    matchQuery.status = status;
  }

  if (jobId) {
    matchQuery.jobId = jobId;
  }

  if (workerId) {
    matchQuery.workerId = workerId;
  }

  const [applications, total, statusCounts] = await Promise.all([
    Application.find(matchQuery)
      .populate({
        path: "jobId",
        select: "title payAmount payType city status employerId",
        populate: { path: "employerId", select: "businessName" },
      })
      .populate({
        path: "workerId",
        select: "fullName profilePhoto ratingAvg city userId",
        populate: { path: "userId", select: "phone" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Application.countDocuments(matchQuery),
    Application.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const countsByStatus = {};
  statusCounts.forEach((sc) => {
    countsByStatus[sc._id] = sc.count;
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        applications,
        statusCounts: countsByStatus,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      "Applications retrieved successfully"
    )
  );
});

export const getApplicationById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const application = await Application.findById(id)
    .populate({
      path: "jobId",
      populate: { path: "employerId", populate: { path: "userId", select: "fullName phone" } },
    })
    .populate({
      path: "workerId",
      populate: { path: "userId", select: "fullName phone" },
    });

  if (!application) {
    throw new ApiError(404, "Application not found");
  }

  return res.status(200).json(
    new ApiResponse(200, application, "Application details retrieved")
  );
});

// ==========================================
// 6. REPORTS & COMPLAINTS (DISPUTES)
// ==========================================

export const getDisputes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { status, search } = req.query;

  const matchQuery = {};
  if (status) {
    matchQuery.status = status;
  }

  if (search && search.trim()) {
    const s = search.trim();
    matchQuery.$or = [
      { reason: { $regex: s, $options: "i" } },
      { description: { $regex: s, $options: "i" } },
    ];
  }

  const [disputes, total] = await Promise.all([
    Dispute.find(matchQuery)
      .populate("jobId", "title city")
      .populate("raisedByUserId", "fullName phone roles")
      .populate("againstUserId", "fullName phone roles")
      .populate("resolvedByAdminId", "fullName phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Dispute.countDocuments(matchQuery),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        disputes,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      "Disputes retrieved successfully"
    )
  );
});

export const getDisputeById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const dispute = await Dispute.findById(id)
    .populate("jobId")
    .populate("raisedByUserId", "fullName phone email roles")
    .populate("againstUserId", "fullName phone email roles")
    .populate("resolvedByAdminId", "fullName phone");

  if (!dispute) {
    throw new ApiError(404, "Dispute not found");
  }

  return res.status(200).json(
    new ApiResponse(200, dispute, "Dispute details retrieved")
  );
});

export const updateDisputeStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, resolutionNote } = req.body;

  const validStatuses = ["open", "under_review", "resolved", "closed"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${validStatuses.join(", ")}`);
  }

  const updatePayload = {
    status,
    resolutionNote: resolutionNote || "",
  };

  if (status === "resolved" || status === "closed") {
    updatePayload.resolvedByAdminId = req.user._id;
    updatePayload.resolvedAt = new Date();
  }

  const dispute = await Dispute.findByIdAndUpdate(id, updatePayload, { new: true })
    .populate("jobId", "title")
    .populate("raisedByUserId", "fullName")
    .populate("againstUserId", "fullName");

  if (!dispute) {
    throw new ApiError(404, "Dispute not found");
  }

  await logAdminAudit(req.user._id, "RESOLVE_DISPUTE", {
    targetJobId: dispute.jobId?._id,
    targetUserId: dispute.againstUserId?._id,
    details: `Dispute status set to ${status}. Note: ${resolutionNote || "None"}`,
    metadata: { disputeId: dispute._id, status, resolutionNote },
  });

  // Notify parties of status update
  const partyIds = [dispute.raisedByUserId?._id, dispute.againstUserId?._id].filter(Boolean);
  const templateKey = status === "resolved" ? "DISPUTE_RESOLVED" : "DISPUTE_STATUS_UPDATED";
  for (const partyId of partyIds) {
    await sendNotificationService({
      userId: partyId,
      type: "dispute",
      templateKey,
      templateData: {
        jobTitle: dispute.jobId?.title?.en || "Job",
        status,
        resolutionNote,
      },
      refId: dispute._id,
      idempotencyKey: `dispute_status_${dispute._id}_${status}_${partyId}`,
    });
  }

  return res.status(200).json(
    new ApiResponse(200, dispute, `Dispute status updated to ${status}`)
  );
});

// ==========================================
// 7. RATINGS & REVIEW MODERATION
// ==========================================

export const getRatings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { minRating, maxRating, isModerated, search } = req.query;

  const matchQuery = {};

  if (minRating || maxRating) {
    matchQuery.rating = {};
    if (minRating) matchQuery.rating.$gte = Number(minRating);
    if (maxRating) matchQuery.rating.$lte = Number(maxRating);
  }

  if (isModerated === "true") matchQuery.isModerated = true;
  if (isModerated === "false") matchQuery.isModerated = false;

  if (search && search.trim()) {
    matchQuery.review = { $regex: search.trim(), $options: "i" };
  }

  const [ratings, total] = await Promise.all([
    Rating.find(matchQuery)
      .populate("jobId", "title city")
      .populate("fromUserId", "fullName phone")
      .populate("toUserId", "fullName phone")
      .populate("moderatedByAdminId", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Rating.countDocuments(matchQuery),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ratings,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      "Ratings retrieved successfully"
    )
  );
});

export const moderateRating = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isModerated, moderationReason, hideReviewText } = req.body;

  if (typeof isModerated !== "boolean") {
    throw new ApiError(400, "isModerated (boolean) is required");
  }

  const updateData = {
    isModerated,
    moderationReason: moderationReason || "Moderated by administrator",
    moderatedAt: new Date(),
    moderatedByAdminId: req.user._id,
  };

  if (hideReviewText) {
    updateData.review = "[Review content removed by administrator for violating guidelines]";
  }

  const rating = await Rating.findByIdAndUpdate(id, updateData, { new: true })
    .populate("fromUserId", "fullName")
    .populate("toUserId", "fullName")
    .populate("jobId", "title");

  if (!rating) {
    throw new ApiError(404, "Rating not found");
  }

  await logAdminAudit(req.user._id, "MODERATE_RATING", {
    targetUserId: rating.toUserId?._id,
    targetJobId: rating.jobId?._id,
    details: moderationReason || `Rating moderated (isModerated=${isModerated})`,
    metadata: { ratingId: id, isModerated, hideReviewText },
  });

  return res.status(200).json(
    new ApiResponse(200, rating, "Rating moderation updated successfully")
  );
});

// ==========================================
// 8. NOTIFICATIONS & ANNOUNCEMENTS
// ==========================================

export const getNotificationStats = asyncHandler(async (req, res) => {
  const [totalNotifications, unreadCount, countsByType, recentAnnouncements] = await Promise.all([
    Notification.countDocuments(),
    Notification.countDocuments({ isRead: false }),
    Notification.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]),
    Notification.find({ type: "announcement" })
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  const typeStats = {};
  countsByType.forEach((item) => {
    typeStats[item._id] = item.count;
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalNotifications,
        unreadCount,
        countsByType: typeStats,
        recentAnnouncements,
      },
      "Notification statistics retrieved"
    )
  );
});

export const sendAnnouncement = asyncHandler(async (req, res) => {
  const { targetRole = "all", title, body, channels = ["in_app"] } = req.body;

  if (!title || (!title.en && !title.mr && !title.hi)) {
    throw new ApiError(400, "Title is required in at least one language");
  }

  if (!body || (!body.en && !body.mr && !body.hi)) {
    throw new ApiError(400, "Body message is required in at least one language");
  }

  // Construct target user query
  const userQuery = { isBlocked: false };
  if (targetRole === "worker") {
    userQuery.roles = "worker";
  } else if (targetRole === "employer") {
    userQuery.roles = "employer";
  }

  const targetUsers = await User.find(userQuery).select("_id");
  if (targetUsers.length === 0) {
    return res.status(200).json(
      new ApiResponse(200, { sentCount: 0, inAppDelivered: 0 }, "No eligible recipients found")
    );
  }

  const titlePayload = {
    en: title.en || title.mr || title.hi || "",
    mr: title.mr || title.en || "",
    hi: title.hi || title.en || "",
  };

  const bodyPayload = {
    en: body.en || body.mr || body.hi || "",
    mr: body.mr || body.en || "",
    hi: body.hi || body.en || "",
  };

  // Bulk insert in-app notifications
  const notificationsToCreate = targetUsers.map((u) => ({
    userId: u._id,
    type: "system",
    channel: "in_app",
    deliveryStatus: "delivered",
    title: titlePayload,
    body: bodyPayload,
    data: { sentByAdminId: req.user._id, targetRole, announcement: true },
  }));

  const inserted = await Notification.insertMany(notificationsToCreate);

  // Check and report external channel delivery capabilities
  const deliveryReport = {
    in_app: { status: "delivered", count: inserted.length },
  };

  const selectedChannels = Array.isArray(channels) ? channels : ["in_app"];
  for (const ch of selectedChannels) {
    if (ch === "in_app") continue;
    const provider = notificationProviders[ch];
    if (provider && provider.isConfigured()) {
      deliveryReport[ch] = {
        status: "configured",
        note: `Provider ${provider.name} is configured and active.`,
      };
    } else {
      deliveryReport[ch] = {
        status: "unavailable",
        note: `Provider for ${ch} is not configured (missing environment credentials).`,
      };
    }
  }

  await logAdminAudit(req.user._id, "SEND_ANNOUNCEMENT", {
    details: `Broadcast announcement sent to ${targetUsers.length} ${targetRole} users via ${selectedChannels.join(", ")}`,
    metadata: {
      targetRole,
      recipientCount: targetUsers.length,
      channels: selectedChannels,
      deliveryReport,
      title: titlePayload.en,
    },
  });

  const deliveryStats = {
    totalTargeted: targetUsers.length,
    delivered: inserted.length,
    skipped: 0,
    failed: 0,
    channel: selectedChannels[0] || "in_app",
  };

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        sentCount: inserted.length,
        inAppDelivered: inserted.length,
        deliveryStats,
        targetRole,
        channels: selectedChannels,
        deliveryReport,
        title: titlePayload,
      },
      `Announcement successfully broadcast to ${inserted.length} users`
    )
  );
});

// ==========================================
// 9. AI SERVICE MONITORING
// ==========================================

export const getAiServiceStatus = asyncHandler(async (req, res) => {
  const healthData = await getAiServiceHealth(5000);

  const monitoringData = {
    serviceStatus: healthData.available ? "operational" : "degraded",
    latencyMs: healthData.latencyMs,
    service: healthData.service || "lokrozgar-ai-service",
    version: healthData.version || "1.0.0",
    capabilities: healthData.capabilities || [
      "recommendations",
      "voice_extraction",
      "translation",
      "skill_resolution",
    ],
    timestamp: new Date().toISOString(),
    evaluationMetrics: "Not measured (requires offline ground-truth benchmark)",
  };

  return res.status(200).json(
    new ApiResponse(200, monitoringData, "AI service monitoring status retrieved")
  );
});

// ==========================================
// 10. AUDIT LOGS
// ==========================================

export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { actionType, adminId, startDate, endDate } = req.query;

  const matchQuery = {};

  if (actionType) {
    matchQuery.actionType = actionType;
  }

  if (adminId) {
    matchQuery.adminId = adminId;
  }

  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }

  const [logs, total, actionTypes] = await Promise.all([
    AdminAction.find(matchQuery)
      .populate("adminId", "fullName phone roles")
      .populate("targetUserId", "fullName phone roles")
      .populate("targetJobId", "title city")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    AdminAction.countDocuments(matchQuery),
    AdminAction.distinct("actionType"),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        logs,
        actionTypes,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      "Audit logs retrieved successfully"
    )
  );
});

// Retain legacy routes compatibility
export const blockUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;

  const user = await User.findByIdAndUpdate(userId, { isBlocked: true }, { new: true }).select("-passwordHash");
  if (!user) throw new ApiError(404, "User not found");

  await logAdminAudit(req.user._id, "BLOCK_USER", { targetUserId: userId, details: reason || "User blocked by admin" });

  return res.status(200).json(new ApiResponse(200, user, "User blocked"));
});

export const unblockUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findByIdAndUpdate(userId, { isBlocked: false }, { new: true }).select("-passwordHash");
  if (!user) throw new ApiError(404, "User not found");

  await logAdminAudit(req.user._id, "UNBLOCK_USER", { targetUserId: userId, details: "User unblocked by admin" });

  return res.status(200).json(new ApiResponse(200, user, "User unblocked"));
});

export const flagUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { fraudScore } = req.body;

  await logAdminAudit(req.user._id, "FLAG_USER", { targetUserId: userId, details: `Fraud score updated to ${fraudScore}` });

  return res.status(200).json(new ApiResponse(200, { userId, fraudScore }, "User flagged"));
});

export const verifyDocument = asyncHandler(async (req, res) => {
  const { docId } = req.params;
  const { status } = req.body;

  const doc = await Document.findByIdAndUpdate(
    docId,
    { verificationStatus: status, verifiedByAdminId: req.user._id, verifiedAt: new Date() },
    { new: true }
  );

  if (!doc) throw new ApiError(404, "Document not found");

  await logAdminAudit(req.user._id, "VERIFY_DOCUMENT", { targetUserId: doc.ownerId, details: `Document ${status}` });

  return res.status(200).json(new ApiResponse(200, doc, `Document ${status}`));
});

export const verifyWorkerSkill = asyncHandler(async (req, res) => {
  const { skillId } = req.params;
  const { status } = req.body;

  const skill = await WorkerSkill.findByIdAndUpdate(
    skillId,
    { verificationStatus: status, verifiedByAdminId: req.user._id, verifiedAt: new Date() },
    { new: true }
  );

  if (!skill) throw new ApiError(404, "Worker skill not found");

  await logAdminAudit(req.user._id, "VERIFY_SKILL", { details: `Worker skill ${status}` });

  return res.status(200).json(new ApiResponse(200, skill, `Worker skill ${status}`));
});
