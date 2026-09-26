import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Middleware to load existing WorkerProfile and/or EmployerProfile onto req object.
 */
export const loadProfiles = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required to load profile"));
  }

  const userId = req.user._id;

  const [workerProfile, employerProfile] = await Promise.all([
    WorkerProfile.findOne({ userId }),
    EmployerProfile.findOne({ userId }),
  ]);

  req.workerProfile = workerProfile || null;
  req.employerProfile = employerProfile || null;

  next();
});

/**
 * Middleware enforcing that the authenticated user has an active WorkerProfile.
 */
export const requireWorkerProfile = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }

  if (!req.workerProfile) {
    const profile = await WorkerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      throw new ApiError(
        404,
        "Worker profile not found. Please complete your worker profile first."
      );
    }
    req.workerProfile = profile;
  }

  next();
});

/**
 * Middleware enforcing that the authenticated user has an active EmployerProfile.
 */
export const requireEmployerProfile = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }

  if (!req.employerProfile) {
    const profile = await EmployerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      throw new ApiError(
        404,
        "Employer profile not found. Please complete your employer profile first."
      );
    }
    req.employerProfile = profile;
  }

  next();
});
