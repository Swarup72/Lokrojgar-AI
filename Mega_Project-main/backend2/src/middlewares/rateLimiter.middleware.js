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

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// A React dev server re-renders (StrictMode double-invokes effects) and the
// browser sends a preflight before every authenticated call, so a single page
// load can easily cost dozens of requests. 100/15min is a sensible production
// ceiling but locks a developer out after a few page loads, which surfaces as
// an opaque CORS failure in the browser rather than a readable 429.
export const DEV_RATE_LIMIT_MAX = 1000;
export const PROD_RATE_LIMIT_MAX = 100;

/**
 * Requests allowed per IP per window. RATE_LIMIT_MAX overrides the default in
 * any environment; otherwise production keeps the original 100 and every other
 * environment gets the development ceiling. A non-numeric, zero or negative
 * RATE_LIMIT_MAX falls back to the default rather than disabling the limiter -
 * a typo in .env must never silently remove rate limiting.
 */
export function resolveRateLimitMax(env = process.env) {
  const configured = Number(env.RATE_LIMIT_MAX);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return env.NODE_ENV === "production" ? PROD_RATE_LIMIT_MAX : DEV_RATE_LIMIT_MAX;
}

/**
 * The global limiter applied to every request in app.js.
 *
 * `limit` is a function, not a number, deliberately: src/index.js imports
 * app.js (and therefore this module) BEFORE it calls dotenv.config(), because
 * ESM imports are evaluated before the module body runs. Reading process.env
 * once at module level would therefore never see RATE_LIMIT_MAX or NODE_ENV
 * from .env. Resolving per request reads them after dotenv has loaded.
 */
export const globalRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: () => resolveRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  // A CORS preflight is issued by the browser, not by application code, and
  // carries no credentials or body - counting it made every authenticated
  // call consume two slots. Skipping it does not weaken the limit on the
  // real requests that follow, which are still counted normally.
  skip: (req) => req.method === "OPTIONS",
  handler: (req, res, next, options) => {
    next(new ApiError(429, options.message || "Too many requests, please try again later."));
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
