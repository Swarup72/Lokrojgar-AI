import { z } from "zod";

// Reviews are user-generated content on a public profile. The model enforces
// min/max on `rating`, but Mongoose happily stored a fractional score (3.7
// was accepted and persisted), and nothing bounded the review text beyond
// express's 20kb body limit. Both are validated here, before the controller,
// using the project's existing zod + validate() convention.
export const MAX_REVIEW_LENGTH = 1000;

export const submitRatingValidator = z.object({
  body: z.object({
    jobId: z.string().min(1, "Job ID is required"),
    toUserId: z.string().min(1, "Target user ID is required"),
    // Whole stars only: a 1-5 star control cannot produce 3.7, and a
    // fractional average is derived from many ratings, never submitted.
    score: z
      .number({ invalid_type_error: "Score must be a number between 1 and 5" })
      .int("Score must be a whole number between 1 and 5")
      .min(1, "Score must be between 1 and 5")
      .max(5, "Score must be between 1 and 5"),
    review: z
      .string()
      .max(MAX_REVIEW_LENGTH, `Review cannot exceed ${MAX_REVIEW_LENGTH} characters`)
      .optional(),
  }),
});

export const userRatingsParamValidator = z.object({
  params: z.object({
    userId: z.string().min(1, "User ID is required"),
  }),
});
