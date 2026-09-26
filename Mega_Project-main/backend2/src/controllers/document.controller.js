import Document from "../models/document.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadPDFService, uploadImageService } from "../services/storage.service.js";

export const uploadDocument = asyncHandler(async (req, res) => {
  const { documentType } = req.body;
  if (!req.file) throw new ApiError(400, "File is required");

  let uploadResult;
  if (req.file.mimetype === "application/pdf") {
    uploadResult = await uploadPDFService(req.file.path);
  } else {
    uploadResult = await uploadImageService(req.file.path);
  }

  if (!uploadResult) throw new ApiError(500, "Failed to upload document to storage");

  const doc = await Document.create({
    ownerId: req.user._id,
    documentType,
    fileUrl: uploadResult.secure_url,
    verificationStatus: "pending",
  });

  return res.status(201).json(new ApiResponse(201, doc, "Document uploaded successfully"));
});

export const listMyDocuments = asyncHandler(async (req, res) => {
  const docs = await Document.find({ ownerId: req.user._id });
  return res.status(200).json(new ApiResponse(200, docs, "Documents retrieved"));
});

export const verifyOrRejectDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;

  if (!["verified", "rejected"].includes(status)) {
    throw new ApiError(400, "Status must be verified or rejected");
  }

  const doc = await Document.findByIdAndUpdate(
    id,
    {
      verificationStatus: status,
      verifiedByAdminId: req.user._id,
      verifiedAt: new Date(),
    },
    { new: true }
  );

  if (!doc) throw new ApiError(404, "Document not found");

  return res.status(200).json(new ApiResponse(200, doc, `Document ${status}`));
});
