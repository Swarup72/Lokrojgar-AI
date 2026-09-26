import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/ApiError.js";

/**
 * Stricter Rate Limiter for OTP Generation and Verification.
 * Limits to 5 requests per 15 minutes window per IP.
 */
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests max
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    next(
      new ApiError(
        429,
        "Too many OTP requests. Please wait 15 minutes before trying again."
      )
    );
  },
});

/**
 * Rate Limiter for Login Endpoint.
 * Limits to 5 failed login attempts per 15 minutes window per IP.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts max
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    next(
      new ApiError(
        429,
        "Too many login attempts. Please wait 15 minutes before trying again."
      )
    );
  },
});

/**
 * Standard Rate Limiter for General API Endpoints.
 * Limits to 100 requests per 15 minutes window per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests max
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    next(
      new ApiError(
        429,
        "Too many requests from this IP. Please try again later."
      )
    );
  },
});
