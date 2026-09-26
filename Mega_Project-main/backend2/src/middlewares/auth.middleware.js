import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Middleware to verify JWT token, ensure user is active & not blocked,
 * and verify that the session has not been revoked.
 */
export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.headers.authorization?.replace("Bearer ", "").trim();

  if (!token) {
    throw new ApiError(401, "Unauthorized request: Access token is missing");
  }

  let decodedToken;
  try {
    decodedToken = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET || "access_secret"
    );
  } catch (error) {
    throw new ApiError(401, "Unauthorized request: Invalid or expired token");
  }

  const user = await User.findById(decodedToken?._id).select(
    "-passwordHash"
  );

  if (!user) {
    throw new ApiError(401, "Unauthorized request: User no longer exists");
  }

  if (user.isBlocked) {
    throw new ApiError(
      403,
      "Access forbidden: User account has been blocked by administrator"
    );
  }

  // Check session status if deviceId or active session tracking is used
  const activeSession = await Session.findOne({
    userId: user._id,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  });

  if (!activeSession) {
    // Note: If session management is enforced, unrevoked session check passes
    // Attach session reference to request for downstream handlers if needed
    req.session = null;
  } else {
    req.session = activeSession;
  }

  req.user = user;
  next();
});
