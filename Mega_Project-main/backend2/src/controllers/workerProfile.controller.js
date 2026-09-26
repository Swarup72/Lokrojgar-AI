import WorkerProfile from "../models/workerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadImageService } from "../services/storage.service.js";

export const getWorkerProfile = asyncHandler(async (req, res) => {
  const profile = await WorkerProfile.findOne({ userId: req.user._id })
    .populate("preferredJobCategories");

  if (!profile) {
    throw new ApiError(404, "Worker profile not found");
  }

  return res.status(200).json(new ApiResponse(200, profile, "Worker profile retrieved"));
});

export const createOrUpdateProfile = asyncHandler(async (req, res) => {
  const {
    fullName,
    bio,
    city,
    village,
    coordinates,
    expectedPay,
    languages,
    preferredJobCategories,
    preferredWorkRadiusKm,
    experienceYears,
  } = req.body;

  const updateData = {
    userId: req.user._id,
    fullName,
    ...(bio && { bio }),
    ...(city && { city }),
    ...(village && { village }),
    ...(expectedPay !== undefined && { expectedPay }),
    ...(languages && { languages }),
    ...(preferredJobCategories && { preferredJobCategories }),
    ...(preferredWorkRadiusKm && { preferredWorkRadiusKm }),
    ...(experienceYears !== undefined && { experienceYears }),
  };

  if (coordinates && Array.isArray(coordinates) && coordinates.length === 2) {
    updateData.location = {
      type: "Point",
      coordinates,
    };
  }

  const profile = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id },
    updateData,
    { upsert: true, new: true, runValidators: true }
  );

  return res.status(200).json(new ApiResponse(200, profile, "Worker profile updated"));
});

export const toggleAvailability = asyncHandler(async (req, res) => {
  const { availability } = req.body;
  const profile = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id },
    { availability },
    { new: true }
  );

  if (!profile) {
    throw new ApiError(404, "Worker profile not found");
  }

  return res.status(200).json(new ApiResponse(200, profile, "Availability updated"));
});

export const updateLocation = asyncHandler(async (req, res) => {
  const { coordinates } = req.body;
  const profile = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id },
    { location: { type: "Point", coordinates } },
    { new: true, runValidators: true }
  );

  return res.status(200).json(new ApiResponse(200, profile, "Worker location updated"));
});

export const updateRadius = asyncHandler(async (req, res) => {
  const { preferredWorkRadiusKm } = req.body;
  const profile = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id },
    { preferredWorkRadiusKm },
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, profile, "Work radius updated"));
});

export const updateCategories = asyncHandler(async (req, res) => {
  const { preferredJobCategories } = req.body;
  const profile = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id },
    { preferredJobCategories },
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, profile, "Preferred categories updated"));
});

export const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Image file is required");
  }

  const result = await uploadImageService(req.file.path);
  if (!result) {
    throw new ApiError(500, "Failed to upload image to storage");
  }

  const profile = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id },
    { profilePhoto: result.secure_url },
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, profile, "Profile photo updated"));
});
