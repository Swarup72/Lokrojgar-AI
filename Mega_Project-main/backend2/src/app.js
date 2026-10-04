import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { ApiError } from "./utils/ApiError.js";
import { globalRateLimiter } from "./middlewares/rateLimiter.middleware.js";
import v1Router from "./routes/index.js";

const app = express();

// Security Middlewares
app.use(helmet());

// Request Logger
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// CORS must be registered BEFORE the rate limiter. Middleware runs in
// registration order, so a 429 short-circuits everything after it: with the
// limiter first, the rejection carried no Access-Control-Allow-Origin header
// and the browser reported an opaque CORS failure instead of the real 429.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// Rate Limiting Middleware (limit resolved per request - see the middleware)
app.use(globalRateLimiter);

// Standard Middlewares

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Health Check Route
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API Routes (Mounted at /api/v1/*)
app.use("/api/v1", v1Router);

// 404 Handler
app.use((req, res, next) => {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
});

// Global Error Handler returning ApiError as JSON
app.use((err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    // A CastError means the client sent a malformed id - that is a bad
    // request, not a server fault, and it must not surface as a 500 (nor
    // echo the raw Mongoose cast message back). middlewares/error.middleware.js
    // already classified it this way but is not the handler actually mounted.
    const isBadInput = error.name === "ValidationError" || error.name === "CastError";
    const statusCode = error.statusCode || (isBadInput ? 400 : 500);
    const message =
      error.name === "CastError" ? "Malformed ID format" : error.message || "Internal Server Error";
    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  const response = {
    statusCode: error.statusCode,
    success: false,
    message: error.message,
    errors: error.errors || [],
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
  };

  return res.status(error.statusCode).json(response);
});

export { app };