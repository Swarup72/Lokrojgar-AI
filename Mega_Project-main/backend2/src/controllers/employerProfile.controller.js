import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadImageService } from "../services/storage.service.js";

export const getEmployerProfile = asyncHandler(async (req, res) => {
  const profile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!profile) {
    throw new ApiError(404, "Employer profile not found");
  }
  return res.status(200).json(new ApiResponse(200, profile, "Employer profile retrieved"));
});

export const createOrUpdateProfile = asyncHandler(async (req, res) => {
  const { businessName, businessType, bio, city, village, coordinates } = req.body;

  const updateData = {
    userId: req.user._id,
    businessName,
    businessType,
    ...(bio && { bio }),
    ...(city && { city }),
    ...(village && { village }),
  };

  if (coordinates && Array.isArray(coordinates) && coordinates.length === 2) {
    updateData.location = {
      type: "Point",
      coordinates,
    };
  }

  const profile = await EmployerProfile.findOneAndUpdate(
    { userId: req.user._id },
    updateData,
    { upsert: true, new: true, runValidators: true }
  );

  return res.status(200).json(new ApiResponse(200, profile, "Employer profile updated"));
});

export const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Image file is required");
  }

  const result = await uploadImageService(req.file.path);
  if (!result) {
    throw new ApiError(500, "Failed to upload image");
  }

  const profile = await EmployerProfile.findOneAndUpdate(
    { userId: req.user._id },
    { profilePhoto: result.secure_url },
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, profile, "Profile photo updated"));
});

export const updateBusinessDetails = asyncHandler(async (req, res) => {
  const { businessName, businessType, bio } = req.body;
  const profile = await EmployerProfile.findOneAndUpdate(
    { userId: req.user._id },
    { businessName, businessType, bio },
    { new: true }
  );

  return res.status(200).json(new ApiResponse(200, profile, "Business details updated"));
});
