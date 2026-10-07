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
    // Optional: a profile may legitimately have no location yet (registration no
    // longer invents one). The controller only sets `location` when coordinates
    // are supplied and never clears an existing one, so omitting them edits the
    // rest of the profile and leaves the location untouched. A SUPPLIED pair is
    // still validated in full - and the model re-checks the range.
    coordinates: z
      .array(z.number())
      .length(2, "Coordinates must be [longitude, latitude]")
      .optional(),
    expectedPay: z.number().min(0).optional(),
    languages: z.array(z.enum(["mr", "hi", "en"])).optional(),
    preferredJobCategories: z.array(z.string()).optional(),
    preferredWorkRadiusKm: z.number().min(1).max(200).optional(),
    experienceYears: z.number().min(0).optional(),
  }),
});

export const employerProfileValidator = z.object({
  body: z.object({
    // Both optional: an employer may operate under their own personal name.
    // An empty string is rejected rather than stored, so the display fallback
    // in utils/displayName.js sees null and uses the account's name.
    businessName: z.string().trim().min(2, "Business name must be at least 2 characters").optional(),
    businessType: z.string().trim().min(2, "Business type must be at least 2 characters").optional(),
    bio: z
      .object({
        mr: z.string().optional(),
        hi: z.string().optional(),
        en: z.string().optional(),
      })
      .optional(),
    city: z.string().optional(),
    village: z.string().optional(),
    // Optional: a profile may legitimately have no location yet (registration no
    // longer invents one). The controller only sets `location` when coordinates
    // are supplied and never clears an existing one, so omitting them edits the
    // rest of the profile and leaves the location untouched. A SUPPLIED pair is
    // still validated in full - and the model re-checks the range.
    coordinates: z
      .array(z.number())
      .length(2, "Coordinates must be [longitude, latitude]")
      .optional(),
  }),
});

export const availabilityValidator = z.object({
  body: z.object({
    availability: z.enum(["available", "busy", "unavailable"]),
  }),
});
