import { ApiError } from "../utils/ApiError.js";

/**
 * Zod validation middleware factory.
 * Accepts a Zod schema and validates req.body, req.query, and req.params.
 *
 * @param {import('zod').ZodSchema} schema - Zod validation schema
 */
export const validate = (schema) => async (req, res, next) => {
  try {
    const parsed = await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    // Assign validated and sanitized values back to request
    if (parsed.body) req.body = parsed.body;
    if (parsed.query) req.query = parsed.query;
    if (parsed.params) req.params = parsed.params;

    next();
  } catch (error) {
    if (error.name === "ZodError" || error.issues) {
      const issueErrors = error.issues
        ? error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          }))
        : [];

      const firstMessage = issueErrors.length > 0
        ? issueErrors[0].message
        : "Invalid request payload";

      return next(new ApiError(400, `Validation Error: ${firstMessage}`, issueErrors));
    }
    next(error);
  }
};
