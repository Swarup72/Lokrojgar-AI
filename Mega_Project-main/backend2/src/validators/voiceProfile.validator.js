import { z } from "zod";

/**
 * Voice-profile request validation.
 *
 * Nothing here decides OWNERSHIP - that is established in the controller from
 * req.user, and the VoiceProfile is looked up with workerId as part of the query
 * filter. These schemas only reject malformed payloads before they get there.
 *
 * Note what is deliberately NOT rejected: `null` for a confirmed field, and `0`
 * for a numeric one. Those are meaningful answers - null means "not supplied, so
 * keep what is stored" and 0 means "zero", which a fresher legitimately has.
 * The controller's isSupplied()/isSuppliedText() guards depend on being able to
 * tell those apart, so the validator must preserve the distinction rather than
 * stripping it.
 */

const SPOKEN_LANGUAGES = ["mr", "hi", "en"];
export const GUIDED_VOICE_FIELDS = ["fullName", "expectedPay", "experienceYears", "skills", "city"];
export const GUIDED_EMPLOYER_VOICE_FIELDS = ["fullName", "businessName", "businessType", "city"];
export const GUIDED_ALL_VOICE_FIELDS = [...new Set([...GUIDED_VOICE_FIELDS, ...GUIDED_EMPLOYER_VOICE_FIELDS])];
export const GUIDED_ALL_FIELDS = [...new Set([...GUIDED_ALL_VOICE_FIELDS, "languages", "availability"])];

const spokenLanguage = z.enum(SPOKEN_LANGUAGES, { message: "Language must be mr, hi or en" });
const targetRole = z.enum(["worker", "employer"], { message: "Role must be worker or employer" });

export const guidedStartValidator = z.object({
  body: z.object({
    // The language the worker/employer will SPEAK - not the UI language.
    language: spokenLanguage.optional(),
    role: targetRole.optional(),
  }),
});

export const guidedDraftQueryValidator = z.object({
  query: z
    .object({
      language: spokenLanguage.optional(),
      role: targetRole.optional(),
    })
    .optional(),
});

export const guidedSetFieldValidator = z.object({
  body: z.object({
    language: spokenLanguage.optional(),
    role: targetRole.optional(),
    field: z.enum(GUIDED_ALL_FIELDS, { message: `Field must be one of: ${GUIDED_ALL_FIELDS.join(", ")}` }),
    // Shapes differ per field (number, string, array, enum), so the type check
    // lives in the controller next to the profile schema it must match.
    // null is explicitly allowed: it clears a DRAFT answer, and a draft is not
    // the canonical profile.
    value: z.any(),
  }),
});

export const confirmVoiceProfileValidator = z.object({
  body: z.object({
    voiceProfileId: z.string().min(1, "Voice profile ID is required"),
    confirmedFields: z
      .object({
        fullName: z.string().nullish(),
        city: z.string().nullish(),
        village: z.string().nullish(),
        businessName: z.string().nullish(),
        businessType: z.string().nullish(),
        // .min(0) only - no upper bound here, because the WorkerProfile schema
        // owns that. 0 must pass.
        expectedPay: z.number().min(0, "Expected pay cannot be negative").nullish(),
        experienceYears: z
          .number()
          .min(0, "Experience cannot be negative")
          .max(60, "Experience must be between 0 and 60 years")
          .nullish(),
        availability: z.enum(["available", "busy", "unavailable"]).nullish(),
        languages: z.array(z.enum(SPOKEN_LANGUAGES)).nullish(),
        bio: z.string().nullish(),
        // Free text from speech. Resolved against the real catalog by
        // utils/skillNormalization.js - never stored as invented skill names.
        skills: z.array(z.string()).nullish(),
        preferredJobCategories: z.array(z.string()).nullish(),
      })
      .optional(),
  }),
});
