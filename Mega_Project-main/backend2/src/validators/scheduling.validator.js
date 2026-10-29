import { z } from "zod";
import { SUPPORTED_DURATIONS_MINUTES } from "../models/appointment.model.js";

const intervalSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must be HH:mm (24-hour)"),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "End time must be HH:mm (24-hour)"),
  })
  .strict();

const weekdayEntrySchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    intervals: z.array(intervalSchema).max(8),
  })
  .strict();

export const updateWeeklyAvailabilityValidator = z.object({
  body: z
    .object({
      timeZone: z.string().min(1).max(64).optional(),
      weekly: z.array(weekdayEntrySchema).min(1).max(7),
      acknowledgeConfirmedConflicts: z.boolean().optional(),
    })
    .strict(),
});

export const addExceptionValidator = z.object({
  body: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      type: z.enum(["block_day", "block_range", "extra"]),
      start: z.string().nullable().optional(),
      end: z.string().nullable().optional(),
      reason: z.string().max(200).optional(),
      acknowledgeConfirmedConflicts: z.boolean().optional(),
    })
    .strict(),
});

export const removeExceptionValidator = z.object({
  params: z.object({
    exceptionId: z.string().min(1, "Exception ID is required"),
  }),
});

export const getWorkerAvailabilityRangeValidator = z.object({
  params: z.object({
    workerId: z.string().min(1, "Worker ID is required"),
  }),
  query: z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .optional(),
});

export const createAppointmentValidator = z.object({
  body: z
    .object({
      workerId: z.string().min(1, "Worker ID is required"),
      jobId: z.string().min(1).nullable().optional(),
      startAt: z.string().min(1, "Start timestamp is required"),
      durationMinutes: z.number().int().refine((v) => SUPPORTED_DURATIONS_MINUTES.includes(v), {
        message: `Duration must be one of ${SUPPORTED_DURATIONS_MINUTES.join(", ")} minutes`,
      }),
      purpose: z.string().trim().min(1, "Purpose is required").max(500, "Purpose cannot exceed 500 characters"),
      idempotencyKey: z.string().max(120).optional(),
    })
    .strict(),
});

export const listAppointmentsValidator = z.object({
  query: z
    .object({
      role: z.enum(["worker", "employer"]).optional(),
      status: z
        .enum(["pending", "confirmed", "rejected", "cancelled", "expired", "completed"])
        .optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
});

export const appointmentIdParamValidator = z.object({
  params: z.object({
    appointmentId: z.string().min(1, "Appointment ID is required"),
  }),
});

export const appointmentActionValidator = z.object({
  params: z.object({
    appointmentId: z.string().min(1, "Appointment ID is required"),
  }),
  body: z
    .object({
      reason: z.string().max(300).optional(),
    })
    .strict()
    .optional(),
});

