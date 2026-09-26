import jwt from "jsonwebtoken";
import { ApiError } from "./ApiError.js";
import { TOKEN_EXPIRY } from "../constants.js";

/**
 * Generate both Access Token and Refresh Token for a user.
 * @param {Object} user - User document instance
 * @returns {{ accessToken: string, refreshToken: string }}
 */
const generateAccessAndRefreshTokens = async (user) => {
  try {
    if (!user) {
      throw new ApiError(400, "User document is required for generating tokens");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh tokens"
    );
  }
};

/**
 * Verify an Access Token.
 * @param {string} token
 * @returns {Object} Decoded payload
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET || "access_secret"
    );
  } catch (error) {
    throw new ApiError(401, "Invalid or expired access token");
  }
};

/**
 * Verify a Refresh Token.
 * @param {string} token
 * @returns {Object} Decoded payload
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(
      token,
      process.env.REFRESH_TOKEN_SECRET || "refresh_secret"
    );
  } catch (error) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }
};

export {
  generateAccessAndRefreshTokens,
  verifyAccessToken,
  verifyRefreshToken,
};
