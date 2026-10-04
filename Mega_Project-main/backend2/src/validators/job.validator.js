import { z } from "zod";

const coordinatesSchema = z
  .array(z.number())
  .length(2, "Coordinates must be [longitude, latitude]")
  .refine(
    ([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
    "Coordinates must be [longitude, latitude] with longitude in [-180, 180] and latitude in [-90, 90]"
  );

const validDateSchema = z
  .string()
  .or(z.date())
  .refine((val) => !isNaN(new Date(val).getTime()), "Invalid date format");

export const createJobValidator = z.object({
  body: z.object({
    title: z.union([
      z.string().min(1, "Job title is required"),
      z
        .object({
          mr: z.string().optional(),
          hi: z.string().optional(),
          en: z.string().optional(),
        })
        .refine(
          (v) => !!(v && (v.mr?.trim() || v.hi?.trim() || v.en?.trim())),
          "Job title must be provided in at least one language (mr, hi, or en)"
        ),
    ]),
    description: z
      .union([
        z.string(),
        z.object({
          mr: z.string().optional(),
          hi: z.string().optional(),
          en: z.string().optional(),
        }),
      ])
      .optional(),
    categoryId: z.string().min(1, "Category ID is required"),
    skillIds: z.array(z.string()).optional(),
    coordinates: coordinatesSchema,
    city: z.string().optional(),
    address: z.string().optional(),
    payType: z.enum(["daily", "monthly", "fixed"]),
    payAmount: z.number().min(0, "Pay amount cannot be negative"),
    requiredWorkers: z.number().int().min(1, "At least 1 worker required").default(1),
    startDate: validDateSchema,
    originalLanguage: z.enum(["mr", "hi", "en"]).default("en"),
    experienceRequired: z.number().min(0, "Experience cannot be negative").optional(),
    preferredLanguages: z.array(z.enum(["mr", "hi", "en"])).optional(),
    applicationDeadline: validDateSchema.optional().nullable(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    shiftType: z.enum(["day", "night", "flexible"]).optional(),
    status: z.enum(["open", "draft"]).optional(),
  }),
});

export const updateJobValidator = z.object({
  body: createJobValidator.shape.body.partial(),
});

export const jobIdParamValidator = z.object({
  params: z.object({
    jobId: z.string().min(1, "Job ID is required"),
  }),
});

export const updateJobStatusValidator = z.object({
  params: z.object({
    jobId: z.string().min(1, "Job ID is required"),
  }),
  body: z.object({
    status: z.enum([
      "draft",
      "open",
      "partially_assigned",
      "assigned",
      "completed",
      "cancelled",
      "expired",
    ]),
  }),
});

export const reopenJobValidator = z.object({
  params: z.object({
    jobId: z.string().min(1, "Job ID is required"),
  }),
  body: z
    .object({
      startDate: validDateSchema.optional(),
      applicationDeadline: validDateSchema.optional().nullable(),
      requiredWorkers: z.number().int().min(1).optional(),
    })
    .optional(),
});
