import { z } from "zod";

export const applyForJobValidator = z.object({
  body: z.object({
    jobId: z.string().min(1, "Job ID is required"),
    coverNote: z.string().max(1000, "Cover note cannot exceed 1000 characters").optional(),
  }),
});

export const withdrawApplicationValidator = z.object({
  params: z.object({
    applicationId: z.string().min(1, "Application ID is required"),
  }),
});

export const getJobApplicantsValidator = z.object({
  params: z.object({
    jobId: z.string().min(1, "Job ID is required"),
  }),
  query: z
    .object({
      status: z
        .enum([
          "applied",
          "invited",
          "shortlisted",
          "accepted",
          "rejected",
          "declined",
          "completed",
          "withdrawn",
        ])
        .optional(),
    })
    .optional(),
});

export const getApplicationByIdValidator = z.object({
  params: z.object({
    applicationId: z.string().min(1, "Application ID is required"),
  }),
});

export const shortlistApplicationValidator = z.object({
  params: z.object({
    applicationId: z.string().min(1, "Application ID is required"),
  }),
});

export const acceptOrRejectApplicationValidator = z.object({
  params: z.object({
    applicationId: z.string().min(1, "Application ID is required"),
  }),
  body: z.object({
    status: z.enum(["accepted", "rejected"], {
      errorMap: () => ({ message: "Status must be accepted or rejected" }),
    }),
  }),
});

export const completeApplicationValidator = z.object({
  params: z.object({
    applicationId: z.string().min(1, "Application ID is required"),
  }),
});

// --- Employer-initiated hiring ("job requests") -----------------------------

export const inviteWorkerValidator = z.object({
  body: z.object({
    jobId: z.string().min(1, "Job ID is required"),
    // The WorkerProfile id, as the recommended-workers list returns it. The
    // employer is never taken from the body - it comes from the JWT.
    workerId: z.string().min(1, "Worker ID is required"),
    // Optional: an employer may offer a different rate than the job's default.
    proposedPay: z.number().min(0, "Proposed pay cannot be negative").optional(),
  }),
});

export const respondToInvitationValidator = z.object({
  params: z.object({
    applicationId: z.string().min(1, "Application ID is required"),
  }),
  body: z.object({
    response: z.enum(["accepted", "declined"], { message: "Response must be accepted or declined" }),
  }),
});
