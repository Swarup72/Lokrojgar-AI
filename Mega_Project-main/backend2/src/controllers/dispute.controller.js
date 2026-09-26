import Dispute from "../models/dispute.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadImageService } from "../services/storage.service.js";
import { DISPUTE_STATUS } from "../constants.js";

export const raiseDispute = asyncHandler(async (req, res) => {
  const { jobId, againstUserId, reason, description } = req.body;

  const dispute = await Dispute.create({
    jobId,
    raisedByUserId: req.user._id,
    againstUserId,
    reason,
    description,
    status: DISPUTE_STATUS.OPEN,
  });

  return res.status(201).json(new ApiResponse(201, dispute, "Dispute raised successfully"));
});

export const getMyDisputes = asyncHandler(async (req, res) => {
  const disputes = await Dispute.find({
    $or: [{ raisedByUserId: req.user._id }, { againstUserId: req.user._id }],
  })
    .populate("jobId raisedByUserId againstUserId")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, disputes, "Disputes retrieved"));
});

export const addEvidence = asyncHandler(async (req, res) => {
  const { disputeId } = req.params;
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw new ApiError(404, "Dispute not found");

  if (!req.file && !req.body.evidenceUrl) {
    throw new ApiError(400, "Evidence file or URL is required");
  }

  let fileUrl = req.body.evidenceUrl;
  if (req.file) {
    const upload = await uploadImageService(req.file.path);
    if (upload) fileUrl = upload.secure_url;
  }

  if (fileUrl) {
    dispute.evidence.push(fileUrl);
    await dispute.save();
  }

  return res.status(200).json(new ApiResponse(200, dispute, "Evidence added successfully"));
});

export const resolveDispute = asyncHandler(async (req, res) => {
  const { disputeId } = req.params;
  const { resolutionNote, status = DISPUTE_STATUS.RESOLVED } = req.body;

  const dispute = await Dispute.findByIdAndUpdate(
    disputeId,
    {
      status,
      resolutionNote,
      resolvedByAdminId: req.user._id,
      resolvedAt: new Date(),
    },
    { new: true }
  );

  if (!dispute) throw new ApiError(404, "Dispute not found");

  return res.status(200).json(new ApiResponse(200, dispute, "Dispute resolved by admin"));
});
