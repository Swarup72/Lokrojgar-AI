import { z } from "zod";

export const createJobValidator = z.object({
  body: z.object({
    title: z.object({
      mr: z.string().optional(),
      hi: z.string().optional(),
      en: z.string().optional(),
    }),
    description: z
      .object({
        mr: z.string().optional(),
        hi: z.string().optional(),
        en: z.string().optional(),
      })
      .optional(),
    categoryId: z.string().min(1, "Category ID is required"),
    skillIds: z.array(z.string()).optional(),
    coordinates: z.array(z.number()).length(2, "Coordinates [lng, lat] required"),
    city: z.string().optional(),
    address: z.string().optional(),
    payType: z.enum(["daily", "monthly", "fixed"]),
    payAmount: z.number().min(0, "Pay amount must be positive"),
    requiredWorkers: z.number().min(1, "At least 1 worker required").default(1),
    startDate: z.string().or(z.date()),
    originalLanguage: z.enum(["mr", "hi", "en"]).default("en"),
    experienceRequired: z.number().min(0).optional(),
    preferredLanguages: z.array(z.enum(["mr", "hi", "en"])).optional(),
    applicationDeadline: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    shiftType: z.enum(["day", "night", "flexible"]).optional(),
  }),
});

export const updateJobValidator = z.object({
  body: createJobValidator.shape.body.partial(),
});
