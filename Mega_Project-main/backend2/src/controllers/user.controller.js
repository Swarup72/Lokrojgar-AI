import User from "../models/user.model.js";
import DeviceToken from "../models/deviceToken.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-passwordHash");
  const [workerProfile, employerProfile] = await Promise.all([
    WorkerProfile.findOne({ userId: user._id }),
    EmployerProfile.findOne({ userId: user._id }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { user, workerProfile, employerProfile },
      "User profile retrieved"
    )
  );
});

export const updateLanguagePreference = asyncHandler(async (req, res) => {
  const { preferredLanguage } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { preferredLanguage },
    { new: true }
  ).select("-passwordHash");

  return res.status(200).json(
    new ApiResponse(200, user, "Language preference updated")
  );
});

export const deleteAccount = asyncHandler(async (req, res) => {
  await Promise.all([
    User.findByIdAndDelete(req.user._id),
    WorkerProfile.deleteOne({ userId: req.user._id }),
    EmployerProfile.deleteOne({ userId: req.user._id }),
    DeviceToken.deleteMany({ userId: req.user._id }),
  ]);

  return res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json(new ApiResponse(200, {}, "Account deleted successfully"));
});

export const registerDeviceToken = asyncHandler(async (req, res) => {
  const { token, platform } = req.body;

  const deviceToken = await DeviceToken.findOneAndUpdate(
    { token },
    {
      userId: req.user._id,
      token,
      platform: platform || "android",
      isActive: true,
      lastUsedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  return res.status(200).json(
    new ApiResponse(200, deviceToken, "Device token registered")
  );
});
