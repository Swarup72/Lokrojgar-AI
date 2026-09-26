import { ApiError } from "../utils/ApiError.js";

/**
 * 404 Not Found Middleware for handling unmapped routes.
 */
export const notFound = (req, res, next) => {
  const error = new ApiError(
    404,
    `Route Not Found - ${req.method} ${req.originalUrl}`
  );
  next(error);
};

/**
 * Global Error Handling Middleware returning ApiError as JSON.
 */
export const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode =
      error.statusCode || (error.name === "ValidationError" ? 400 : 500);
    const message = error.message || "Internal Server Error";
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
};
