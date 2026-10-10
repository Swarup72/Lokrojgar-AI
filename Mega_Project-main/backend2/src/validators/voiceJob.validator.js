import { z } from "zod";

/**
 * Guided voice JOB POSTING request validation.
 *
 * Nothing here establishes OWNERSHIP — that comes from req.user in the
 * controller, and employerId is part of every draft query filter. These
 * schemas only reject malformed payloads before they get that far.
 *
 * They are deliberately permissive about VALUES. A draft is allowed to be
 * incomplete and even wrong: the employer reviews and corrects every field in
 * the real Add Job form, and the Job schema plus the job validators enforce
 * the actual constraints at publish time. Rejecting a half-spoken advert here
 * would only stop it being saved and resumed.
 */

const SPOKEN_LANGUAGES = ["mr", "hi", "en"];

export const VOICE_JOB_VOICE_FIELDS = [
  "jobTitle",
  "jobDescription",
  "jobSkills",
  "jobWorkerCount",
  "jobCity",
  "jobPayAmount",
  "jobPayType",
];
export const VOICE_JOB_TAP_FIELDS = ["jobStartDate", "jobShiftType"];
export const VOICE_JOB_ALL_FIELDS = [...VOICE_JOB_VOICE_FIELDS, ...VOICE_JOB_TAP_FIELDS];

const spokenLanguage = z.enum(SPOKEN_LANGUAGES, { message: "Language must be mr, hi or en" });

export const voiceJobStartValidator = z.object({
  body: z.object({
    // The language the employer will SPEAK, not the UI language.
    language: spokenLanguage.optional(),
  }),
});

export const voiceJobDraftQueryValidator = z.object({
  query: z
    .object({
      language: spokenLanguage.optional(),
    })
    .passthrough(),
});

export const voiceJobSetFieldValidator = z.object({
  body: z.object({
    language: spokenLanguage.optional(),
    field: z.enum(VOICE_JOB_ALL_FIELDS, {
      message: `Field must be one of: ${VOICE_JOB_ALL_FIELDS.join(", ")}`,
    }),
    // `null` is meaningful — it clears a field the employer decided to skip —
    // so it must survive validation rather than being stripped.
    value: z.any().optional(),
  }),
});

export const voiceJobConsumeValidator = z.object({
  body: z.object({
    language: spokenLanguage.optional(),
  }),
});
