import { z } from "zod";

export const workerProfileValidator = z.object({
  body: z.object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    bio: z
      .object({
        mr: z.string().optional(),
        hi: z.string().optional(),
        en: z.string().optional(),
      })
      .optional(),
    city: z.string().optional(),
    village: z.string().optional(),
    coordinates: z.array(z.number()).length(2, "Coordinates must be [longitude, latitude]"),
    expectedPay: z.number().min(0).optional(),
    languages: z.array(z.enum(["mr", "hi", "en"])).optional(),
    preferredJobCategories: z.array(z.string()).optional(),
    preferredWorkRadiusKm: z.number().min(1).max(200).optional(),
    experienceYears: z.number().min(0).optional(),
  }),
});

export const employerProfileValidator = z.object({
  body: z.object({
    businessName: z.string().min(2, "Business name is required"),
    businessType: z.string().min(2, "Business type is required"),
    bio: z
      .object({
        mr: z.string().optional(),
        hi: z.string().optional(),
        en: z.string().optional(),
      })
      .optional(),
    city: z.string().optional(),
    village: z.string().optional(),
    coordinates: z.array(z.number()).length(2, "Coordinates must be [longitude, latitude]"),
  }),
});

export const availabilityValidator = z.object({
  body: z.object({
    availability: z.enum(["available", "busy", "unavailable"]),
  }),
});
