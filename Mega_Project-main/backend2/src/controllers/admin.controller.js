import AdminAction from "../models/adminAction.model.js";
import User from "../models/user.model.js";
import Job from "../models/job.model.js";
import Shift from "../models/shift.model.js";
import Payment from "../models/payment.model.js";
import Dispute from "../models/dispute.model.js";
import Document from "../models/document.model.js";
import WorkerSkill from "../models/workerSkill.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Helper function to log audit entries
const logAdminAudit = async (adminId, actionType, { targetUserId = null, targetJobId = null, details = "", metadata = {} } = {}) => {
  await AdminAction.create({
    adminId,
    actionType,
    targetUserId,
    targetJobId,
    details,
    metadata,
  });
};

export const getDashboardStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalJobs, totalShifts, totalPayments, openDisputes, pendingDocs] = await Promise.all([
    User.countDocuments(),
    Job.countDocuments(),
    Shift.countDocuments(),
    Payment.countDocuments(),
    Dispute.countDocuments({ status: "open" }),
    Document.countDocuments({ verificationStatus: "pending" }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalUsers,
        totalJobs,
        totalShifts,
        totalPayments,
        openDisputes,
        pendingDocs,
      },
      "Admin dashboard stats retrieved"
    )
  );
});

export const blockUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;

  const user = await User.findByIdAndUpdate(userId, { isBlocked: true }, { new: true });
  if (!user) throw new ApiError(404, "User not found");

  await logAdminAudit(req.user._id, "BLOCK_USER", { targetUserId: userId, details: reason || "User blocked by admin" });

  return res.status(200).json(new ApiResponse(200, user, "User blocked"));
});

export const unblockUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findByIdAndUpdate(userId, { isBlocked: false }, { new: true });
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
  const { status } = req.body; // 'verified' or 'rejected'

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
  const { status } = req.body; // 'verified' or 'revoked'

  const skill = await WorkerSkill.findByIdAndUpdate(
    skillId,
    { verificationStatus: status, verifiedByAdminId: req.user._id, verifiedAt: new Date() },
    { new: true }
  );

  if (!skill) throw new ApiError(404, "Worker skill not found");

  await logAdminAudit(req.user._id, "VERIFY_SKILL", { details: `Worker skill ${status}` });

  return res.status(200).json(new ApiResponse(200, skill, `Worker skill ${status}`));
});

export const moderateJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { action } = req.body; // 'cancel', 'close', 'delete'

  let job;
  if (action === "delete") {
    job = await Job.findByIdAndDelete(jobId);
  } else {
    job = await Job.findByIdAndUpdate(jobId, { status: action === "cancel" ? "cancelled" : "completed" }, { new: true });
  }

  await logAdminAudit(req.user._id, "MODERATE_JOB", { targetJobId: jobId, details: `Job action: ${action}` });

  return res.status(200).json(new ApiResponse(200, job, `Job action ${action} executed`));
});

export const getAuditLogs = asyncHandler(async (req, res) => {
  const logs = await AdminAction.find()
    .populate("adminId targetUserId targetJobId")
    .sort({ createdAt: -1 })
    .limit(100);

  return res.status(200).json(new ApiResponse(200, logs, "Audit logs retrieved"));
});
