import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendOTPService, verifyOTPService } from "../services/otp.service.js";
import { generateAccessAndRefreshTokens, verifyRefreshToken } from "../utils/tokens.js";
import { COOKIE_OPTIONS } from "../constants.js";
import crypto from "crypto";

export const sendOTP = asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body;
  const result = await sendOTPService(phone, purpose);
  return res.status(200).json(new ApiResponse(200, result, "OTP sent successfully"));
});

export const verifyOTP = asyncHandler(async (req, res) => {
  const { phone, otp, purpose } = req.body;
  const isValid = await verifyOTPService(phone, otp, purpose);

  if (!isValid) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  return res.status(200).json(new ApiResponse(200, { verified: true }, "OTP verified successfully"));
});

export const register = asyncHandler(async (req, res) => {
  const { phone, password, roles, fullName, businessName, businessType, preferredLanguage } = req.body;

  const existingUser = await User.findOne({ phone });
  if (existingUser) {
    throw new ApiError(409, "User with this phone number already exists");
  }

  const user = await User.create({
    phone,
    passwordHash: password,
    roles,
    preferredLanguage: preferredLanguage || "en",
    isVerified: true,
    phoneVerifiedAt: new Date(),
  });

  // Create initial profile depending on role
  if (roles.includes("worker") && fullName) {
    await WorkerProfile.create({
      userId: user._id,
      fullName,
      location: { type: "Point", coordinates: [73.8567, 18.5204] }, // Default Pune coordinates
    });
  }

  if (roles.includes("employer") && businessName) {
    await EmployerProfile.create({
      userId: user._id,
      businessName,
      businessType: businessType || "Individual",
      location: { type: "Point", coordinates: [73.8567, 18.5204] },
    });
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);

  // Register session
  const deviceId = req.headers["x-device-id"] || crypto.randomUUID();
  const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  await Session.create({
    userId: user._id,
    refreshTokenHash,
    deviceId,
    platform: req.headers["x-platform"] || "android",
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  });

  const loggedInUser = await User.findById(user._id).select("-passwordHash");

  return res
    .status(201)
    .cookie("accessToken", accessToken, COOKIE_OPTIONS)
    .cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
    .json(
      new ApiResponse(
        201,
        { user: loggedInUser, accessToken, refreshToken },
        "User registered successfully"
      )
    );
});

export const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  const user = await User.findOne({ phone });
  if (!user) {
    throw new ApiError(404, "User not found with this phone number");
  }

  if (user.isBlocked) {
    throw new ApiError(403, "Your account has been blocked by administrator");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid password");
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);

  // Register device session
  const deviceId = req.headers["x-device-id"] || crypto.randomUUID();
  const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  await Session.findOneAndUpdate(
    { userId: user._id, deviceId },
    {
      userId: user._id,
      refreshTokenHash,
      deviceId,
      platform: req.headers["x-platform"] || "android",
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      isRevoked: false,
    },
    { upsert: true, new: true }
  );

  const loggedInUser = await User.findById(user._id).select("-passwordHash");

  return res
    .status(200)
    .cookie("accessToken", accessToken, COOKIE_OPTIONS)
    .cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "Login successful"
      )
    );
});

export const logout = asyncHandler(async (req, res) => {
  const deviceId = req.headers["x-device-id"];
  if (deviceId) {
    await Session.updateOne(
      { userId: req.user._id, deviceId },
      { isRevoked: true }
    );
  } else {
    await Session.updateMany({ userId: req.user._id }, { isRevoked: true });
  }

  return res
    .status(200)
    .clearCookie("accessToken", COOKIE_OPTIONS)
    .clearCookie("refreshToken", COOKIE_OPTIONS)
    .json(new ApiResponse(200, {}, "Logged out successfully"));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Refresh token is missing");
  }

  const decoded = verifyRefreshToken(incomingRefreshToken);
  const user = await User.findById(decoded._id);

  if (!user || user.isBlocked) {
    throw new ApiError(401, "Invalid refresh token or user blocked");
  }

  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(incomingRefreshToken)
    .digest("hex");

  const session = await Session.findOne({
    userId: user._id,
    refreshTokenHash,
    isRevoked: false,
  });

  if (!session || session.expiresAt < new Date()) {
    throw new ApiError(401, "Session expired or revoked");
  }

  const { accessToken, refreshToken: newRefreshToken } =
    await generateAccessAndRefreshTokens(user);

  session.refreshTokenHash = crypto
    .createHash("sha256")
    .update(newRefreshToken)
    .digest("hex");
  session.lastUsedAt = new Date();
  await session.save();

  return res
    .status(200)
    .cookie("accessToken", accessToken, COOKIE_OPTIONS)
    .cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS)
    .json(
      new ApiResponse(
        200,
        { accessToken, refreshToken: newRefreshToken },
        "Access token refreshed successfully"
      )
    );
});

export const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);

  const isMatch = await user.isPasswordCorrect(oldPassword);
  if (!isMatch) {
    throw new ApiError(400, "Incorrect current password");
  }

  user.passwordHash = newPassword;
  await user.save();

  return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { phone, otp, newPassword } = req.body;

  const isValid = await verifyOTPService(phone, otp, "password_reset");
  if (!isValid) {
    throw new ApiError(400, "Invalid or expired OTP for password reset");
  }

  const user = await User.findOne({ phone });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.passwordHash = newPassword;
  await user.save();

  return res.status(200).json(new ApiResponse(200, {}, "Password reset successfully"));
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id, isRevoked: false });
  return res.status(200).json(new ApiResponse(200, sessions, "Active sessions retrieved"));
});

export const revokeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  await Session.updateOne({ _id: sessionId, userId: req.user._id }, { isRevoked: true });
  return res.status(200).json(new ApiResponse(200, {}, "Session revoked successfully"));
});

export const addRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!["worker", "employer"].includes(role)) {
    throw new ApiError(400, "Invalid role to add");
  }

  const user = await User.findById(req.user._id);
  if (!user.roles.includes(role)) {
    user.roles.push(role);
    await user.save();
  }

  return res.status(200).json(new ApiResponse(200, { roles: user.roles }, "Role added successfully"));
});
