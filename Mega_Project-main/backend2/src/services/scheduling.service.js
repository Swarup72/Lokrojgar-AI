import mongoose from "mongoose";
import WorkerAvailability, { DEFAULT_WEEKLY_SCHEDULE } from "../models/workerAvailability.model.js";
import Appointment, {
  APPOINTMENT_STATUS,
  SUPPORTED_DURATIONS_MINUTES,
  DEFAULT_RESERVATION_MINUTES,
  computeSlotKeys,
} from "../models/appointment.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import Job from "../models/job.model.js";
import { ApiError } from "../utils/ApiError.js";
import { sendNotificationService } from "./notification.service.js";
import logger from "../utils/logger.js";
import {
  DEFAULT_TIME_ZONE,
  SLOT_MINUTES,
  SLOT_MS,
  addDaysToDateString,
  fromMinutes,
  isSlotAligned,
  isValidDateString,
  isValidTimeZone,
  utcToLocalParts,
} from "../utils/scheduling/time.js";
import {
  ScheduleValidationError,
  dateRange,
  effectiveIntervalsForDate,
  effectiveIntervalsUtc,
  isWithinAvailability,
  normalizeException,
  normalizeWeekly,
  weekdayOfDateString,
} from "../utils/scheduling/availability.js";

function sanitizeText(text, maxLen = 500) {
  if (typeof text !== "string") return "";
  return text.replace(/<[^>]*>/g, "").trim().slice(0, maxLen);
}

function formatAppointmentWhen(startAt, endAt, timeZone = DEFAULT_TIME_ZONE) {
  try {
    const s = utcToLocalParts(new Date(startAt), timeZone);
    const e = utcToLocalParts(new Date(endAt), timeZone);
    return `${s.date} ${fromMinutes(s.minutes)}–${fromMinutes(e.minutes)} (${timeZone})`;
  } catch {
    return new Date(startAt).toISOString();
  }
}

export async function getOrCreateWorkerAvailability(workerId) {
  let doc = await WorkerAvailability.findOne({ workerId });
  if (doc) return doc;
  try {
    doc = await WorkerAvailability.findOneAndUpdate(
      { workerId },
      {
        $setOnInsert: {
          workerId,
          timeZone: DEFAULT_TIME_ZONE,
          weekly: DEFAULT_WEEKLY_SCHEDULE,
          exceptions: [],
          scheduleVersion: 1,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    return doc;
  } catch (err) {
    if (err.code === 11000) {
      return WorkerAvailability.findOne({ workerId });
    }
    throw err;
  }
}

/**
 * Checks whether any future confirmed appointment for `workerId` falls outside
 * the proposed (timeZone, weekly, exceptions) configuration.
 */
async function findConfirmedAppointmentConflicts(workerId, { timeZone, weekly, exceptions }, now = new Date()) {
  const confirmed = await Appointment.find({
    workerId,
    status: APPOINTMENT_STATUS.CONFIRMED,
    endAt: { $gt: now },
  }).lean();

  return confirmed.filter(
    (appt) =>
      !isWithinAvailability({
        startAt: new Date(appt.startAt),
        endAt: new Date(appt.endAt),
        timeZone,
        weekly,
        exceptions,
      })
  );
}

export async function updateWorkerWeeklyAvailability(
  workerId,
  { timeZone, weekly, acknowledgeConfirmedConflicts = false },
  now = new Date()
) {
  const existing = await getOrCreateWorkerAvailability(workerId);
  const nextTimeZone = timeZone !== undefined ? String(timeZone).trim() : existing.timeZone || DEFAULT_TIME_ZONE;

  if (!isValidTimeZone(nextTimeZone)) {
    throw new ApiError(400, `Invalid IANA time zone: "${nextTimeZone}"`);
  }

  let normalizedWeekly;
  try {
    normalizedWeekly = normalizeWeekly(weekly);
  } catch (err) {
    if (err instanceof ScheduleValidationError) {
      throw new ApiError(400, err.message, [{ code: err.code, ...err.details }]);
    }
    throw err;
  }

  const conflicts = await findConfirmedAppointmentConflicts(
    workerId,
    {
      timeZone: nextTimeZone,
      weekly: normalizedWeekly,
      exceptions: existing.exceptions || [],
    },
    now
  );

  if (conflicts.length > 0 && !acknowledgeConfirmedConflicts) {
    throw new ApiError(
      409,
      "Proposed availability conflicts with existing confirmed appointments. Cancel or complete those appointments first, or explicitly acknowledge conflicts.",
      conflicts.map((c) => ({
        appointmentId: String(c._id),
        startAt: c.startAt,
        endAt: c.endAt,
      }))
    );
  }

  const updated = await WorkerAvailability.findOneAndUpdate(
    { workerId },
    {
      $set: {
        timeZone: nextTimeZone,
        weekly: normalizedWeekly,
      },
      $inc: { scheduleVersion: 1 },
    },
    { returnDocument: "after", upsert: true }
  );

  return updated;
}

export async function addAvailabilityException(
  workerId,
  input,
  { acknowledgeConfirmedConflicts = false, now = new Date() } = {}
) {
  let clean;
  try {
    clean = normalizeException(input);
  } catch (err) {
    if (err instanceof ScheduleValidationError) {
      throw new ApiError(400, err.message, [{ code: err.code, ...err.details }]);
    }
    throw err;
  }

  const existing = await getOrCreateWorkerAvailability(workerId);
  const nextExceptions = [...(existing.exceptions || []).map((e) => (e.toObject ? e.toObject() : e)), clean];

  if (clean.type === "block_day" || clean.type === "block_range") {
    const conflicts = await findConfirmedAppointmentConflicts(
      workerId,
      {
        timeZone: existing.timeZone,
        weekly: existing.weekly,
        exceptions: nextExceptions,
      },
      now
    );

    if (conflicts.length > 0 && !acknowledgeConfirmedConflicts) {
      throw new ApiError(
        409,
        "Cannot block this time because a confirmed appointment is already scheduled during the blocked period.",
        conflicts.map((c) => ({
          appointmentId: String(c._id),
          startAt: c.startAt,
          endAt: c.endAt,
        }))
      );
    }
  }

  const updated = await WorkerAvailability.findOneAndUpdate(
    { workerId },
    {
      $push: { exceptions: clean },
      $inc: { scheduleVersion: 1 },
    },
    { returnDocument: "after" }
  );

  return updated;
}

export async function removeAvailabilityException(workerId, exceptionId) {
  if (!mongoose.isValidObjectId(exceptionId)) {
    throw new ApiError(400, "Invalid exception ID format");
  }

  const existing = await getOrCreateWorkerAvailability(workerId);
  const hasTarget = (existing.exceptions || []).some((e) => String(e._id) === String(exceptionId));
  if (!hasTarget) {
    throw new ApiError(404, "Availability exception not found");
  }

  const updated = await WorkerAvailability.findOneAndUpdate(
    { workerId },
    {
      $pull: { exceptions: { _id: new mongoose.Types.ObjectId(exceptionId) } },
      $inc: { scheduleVersion: 1 },
    },
    { returnDocument: "after" }
  );

  return updated;
}

/**
 * Sweeps any pending appointment requests whose temporary reservation has
 * passed `expiresAt`, releasing their `activeSlotKeys` atomically and notifying
 * the employer best-effort.
 */
export async function sweepExpiredPendingAppointments(filter = {}, now = new Date()) {
  const candidates = await Appointment.find({
    ...filter,
    status: APPOINTMENT_STATUS.PENDING,
    expiresAt: { $ne: null, $lte: now },
  }).lean();

  const expiredDocs = [];
  for (const cand of candidates) {
    const updated = await Appointment.findOneAndUpdate(
      {
        _id: cand._id,
        status: APPOINTMENT_STATUS.PENDING,
        expiresAt: { $lte: now },
      },
      {
        $set: {
          status: APPOINTMENT_STATUS.EXPIRED,
          expiredAt: now,
        },
        $unset: { activeSlotKeys: 1 },
      },
      { returnDocument: "after" }
    );

    if (updated) {
      expiredDocs.push(updated);
      notifyAppointmentEvent("APPOINTMENT_EXPIRED", updated).catch((err) =>
        logger.warn("Best-effort expiry notification failed", err?.message)
      );
    }
  }

  return expiredDocs;
}

/**
 * Computes the bookable availability and sanitized busy ranges for a worker
 * across `[fromDate, toDate]` (inclusive YYYY-MM-DD in the worker's timeZone).
 * Does NOT expose private appointment descriptions or exception reasons.
 */
export async function getWorkerAvailabilityRange(workerId, { from, to, now = new Date() } = {}) {
  const workerProfile = await WorkerProfile.findById(workerId).lean();
  if (!workerProfile) {
    throw new ApiError(404, "Worker profile not found");
  }

  await sweepExpiredPendingAppointments({ workerId: workerProfile._id }, now);

  const availDoc = await getOrCreateWorkerAvailability(workerProfile._id);
  const timeZone = availDoc.timeZone || DEFAULT_TIME_ZONE;
  const todayLocal = utcToLocalParts(now, timeZone).date;

  const fromDate = from || todayLocal;
  const toDate = to || addDaysToDateString(fromDate, 13);

  if (!isValidDateString(fromDate) || !isValidDateString(toDate)) {
    throw new ApiError(400, "from and to must be valid YYYY-MM-DD dates");
  }
  if (toDate < fromDate) {
    throw new ApiError(400, "to date must be on or after from date");
  }

  const dates = dateRange(fromDate, toDate);
  if (dates.length > 62) {
    throw new ApiError(400, "Availability range cannot exceed 62 days per query");
  }

  // Query active appointments overlapping the requested window
  const windowStart = new Date(`${fromDate}T00:00:00.000Z`);
  windowStart.setUTCHours(windowStart.getUTCHours() - 14);
  const windowEnd = new Date(`${toDate}T23:59:59.999Z`);
  windowEnd.setUTCHours(windowEnd.getUTCHours() + 14);

  const activeAppointments = await Appointment.find({
    workerId: workerProfile._id,
    status: { $in: [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.PENDING] },
    startAt: { $lt: windowEnd },
    endAt: { $gt: windowStart },
  })
    .select("startAt endAt status expiresAt")
    .sort({ startAt: 1 })
    .lean();

  const busyRanges = activeAppointments
    .filter(
      (a) =>
        a.status === APPOINTMENT_STATUS.CONFIRMED ||
        (a.status === APPOINTMENT_STATUS.PENDING && (!a.expiresAt || new Date(a.expiresAt) > now))
    )
    .map((a) => ({
      startMs: new Date(a.startAt).getTime(),
      endMs: new Date(a.endAt).getTime(),
      startAt: new Date(a.startAt).toISOString(),
      endAt: new Date(a.endAt).toISOString(),
      kind: a.status === APPOINTMENT_STATUS.CONFIRMED ? "confirmed" : "pending_reserved",
      expiresAt: a.expiresAt ? new Date(a.expiresAt).toISOString() : null,
    }));

  const isCoarseUnavailable = workerProfile.availability === "unavailable";

  const days = dates.map((dateStr) => {
    const weekday = weekdayOfDateString(dateStr);
    const rawMins = isCoarseUnavailable
      ? []
      : effectiveIntervalsForDate(dateStr, weekday, availDoc.weekly, availDoc.exceptions);
    const utcIntervals = isCoarseUnavailable
      ? []
      : effectiveIntervalsUtc(dateStr, timeZone, availDoc.weekly, availDoc.exceptions);

    // Subtract busy appointments to produce free UTC intervals & discrete 15-min bookable start slots
    const freeIntervals = [];
    for (const iv of utcIntervals) {
      let segments = [[iv.start.getTime(), iv.end.getTime()]];
      for (const busy of busyRanges) {
        const next = [];
        for (const [s, e] of segments) {
          if (busy.endMs <= s || busy.startMs >= e) {
            next.push([s, e]);
          } else {
            if (busy.startMs > s) next.push([s, busy.startMs]);
            if (busy.endMs < e) next.push([busy.endMs, e]);
          }
        }
        segments = next;
      }
      for (const [s, e] of segments) {
        if (e > s) freeIntervals.push([s, e]);
      }
    }

    const bookableSlots = [];
    const nowMs = now.getTime();
    for (const [segStart, segEnd] of freeIntervals) {
      for (let slotStart = segStart; slotStart + SLOT_MS <= segEnd; slotStart += SLOT_MS) {
        if (slotStart <= nowMs) continue; // Never offer past slots as bookable
        const remainingMinutes = Math.floor((segEnd - slotStart) / 60_000);
        const availableDurations = SUPPORTED_DURATIONS_MINUTES.filter((d) => d <= remainingMinutes);
        if (availableDurations.length > 0) {
          const local = utcToLocalParts(new Date(slotStart), timeZone);
          bookableSlots.push({
            startAt: new Date(slotStart).toISOString(),
            localTime: fromMinutes(local.minutes),
            availableDurations,
            maxDurationMinutes: availableDurations[availableDurations.length - 1],
          });
        }
      }
    }

    const dayBusy = busyRanges.filter((b) => {
      const localStart = utcToLocalParts(new Date(b.startMs), timeZone);
      const localEnd = utcToLocalParts(new Date(b.endMs - 1), timeZone);
      return localStart.date === dateStr || localEnd.date === dateStr;
    });

    return {
      date: dateStr,
      weekday,
      isBlockedDay: (availDoc.exceptions || []).some((e) => e.date === dateStr && e.type === "block_day"),
      workingIntervals: rawMins.map(([s, e]) => ({ start: fromMinutes(s), end: fromMinutes(e) })),
      freeIntervals: freeIntervals.map(([s, e]) => ({
        startAt: new Date(s).toISOString(),
        endAt: new Date(e).toISOString(),
      })),
      bookableSlots,
      busyIntervals: dayBusy.map(({ startAt, endAt, kind, expiresAt }) => ({
        startAt,
        endAt,
        kind,
        expiresAt,
      })),
    };
  });

  return {
    workerId: String(workerProfile._id),
    workerName: workerProfile.fullName,
    coarseAvailability: workerProfile.availability || "available",
    timeZone,
    supportedDurationsMinutes: SUPPORTED_DURATIONS_MINUTES,
    slotStepMinutes: SLOT_MINUTES,
    from: fromDate,
    to: toDate,
    days,
  };
}

/**
 * Creates a new pending appointment request with atomic slot reservation and
 * post-insert availability version re-verification.
 */
export async function createAppointmentRequest({
  employerUser,
  workerId,
  jobId = null,
  startAt,
  durationMinutes,
  purpose,
  idempotencyKey = undefined,
  reservationMinutes = DEFAULT_RESERVATION_MINUTES,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(workerId)) {
    throw new ApiError(400, "Invalid worker ID format");
  }

  const employerProfile = await EmployerProfile.findOne({ userId: employerUser._id });
  if (!employerProfile) {
    throw new ApiError(404, "Employer profile not found. Please complete your employer profile first.");
  }

  const workerProfile = await WorkerProfile.findById(workerId);
  if (!workerProfile) {
    throw new ApiError(404, "Worker profile not found");
  }

  if (String(workerProfile.userId) === String(employerUser._id)) {
    throw new ApiError(400, "You cannot book an appointment with yourself");
  }

  if (workerProfile.availability === "unavailable") {
    throw new ApiError(409, "This worker is currently marked as unavailable for appointments");
  }

  let jobDoc = null;
  if (jobId) {
    if (!mongoose.isValidObjectId(jobId)) {
      throw new ApiError(400, "Invalid job ID format");
    }
    jobDoc = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
    if (!jobDoc) {
      throw new ApiError(404, "Related job not found or does not belong to you");
    }
  }

  const dur = Number(durationMinutes);
  if (!SUPPORTED_DURATIONS_MINUTES.includes(dur)) {
    throw new ApiError(
      400,
      `Unsupported appointment duration. Choose one of: ${SUPPORTED_DURATIONS_MINUTES.join(", ")} minutes.`
    );
  }

  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) {
    throw new ApiError(400, "Invalid appointment start timestamp");
  }
  if (!isSlotAligned(startDate)) {
    throw new ApiError(400, `Appointment start time must align to ${SLOT_MINUTES}-minute intervals`);
  }
  if (startDate.getTime() <= now.getTime()) {
    throw new ApiError(400, "Appointment start time must be in the future");
  }

  const endDate = new Date(startDate.getTime() + dur * 60_000);
  const cleanPurpose = sanitizeText(purpose, 500);
  if (!cleanPurpose) {
    throw new ApiError(400, "Appointment purpose or work details are required");
  }

  const cleanIdempotencyKey =
    typeof idempotencyKey === "string" && idempotencyKey.trim()
      ? idempotencyKey.trim().slice(0, 120)
      : undefined;

  // Sweep expired pending reservations for this worker first
  await sweepExpiredPendingAppointments({ workerId: workerProfile._id }, now);

  // Check idempotency if key provided or identical pending request from same employer exists
  if (cleanIdempotencyKey) {
    const existingByKey = await Appointment.findOne({
      employerId: employerProfile._id,
      idempotencyKey: cleanIdempotencyKey,
    });
    if (existingByKey) {
      return { appointment: existingByKey, idempotent: true };
    }
  }

  const existingDuplicate = await Appointment.findOne({
    employerId: employerProfile._id,
    workerId: workerProfile._id,
    startAt: startDate,
    endAt: endDate,
    status: APPOINTMENT_STATUS.PENDING,
    expiresAt: { $gt: now },
  });
  if (existingDuplicate && existingDuplicate.purpose === cleanPurpose) {
    return { appointment: existingDuplicate, idempotent: true };
  }

  const availBefore = await getOrCreateWorkerAvailability(workerProfile._id);
  const versionBefore = availBefore.scheduleVersion;

  if (
    !isWithinAvailability({
      startAt: startDate,
      endAt: endDate,
      timeZone: availBefore.timeZone,
      weekly: availBefore.weekly,
      exceptions: availBefore.exceptions,
    })
  ) {
    throw new ApiError(409, "Requested appointment interval is outside the worker's available working hours");
  }

  const slotKeys = computeSlotKeys(workerProfile._id, startDate, endDate);
  const expiresAt = new Date(now.getTime() + Math.max(5, Number(reservationMinutes) || DEFAULT_RESERVATION_MINUTES) * 60_000);

  let created;
  try {
    created = await Appointment.create({
      workerId: workerProfile._id,
      employerId: employerProfile._id,
      jobId: jobDoc ? jobDoc._id : null,
      startAt: startDate,
      endAt: endDate,
      durationMinutes: dur,
      timeZone: availBefore.timeZone || DEFAULT_TIME_ZONE,
      purpose: cleanPurpose,
      status: APPOINTMENT_STATUS.PENDING,
      expiresAt,
      activeSlotKeys: slotKeys,
      ...(cleanIdempotencyKey ? { idempotencyKey: cleanIdempotencyKey } : {}),
    });
  } catch (err) {
    if (err.code === 11000) {
      if (cleanIdempotencyKey) {
        const byKey = await Appointment.findOne({
          employerId: employerProfile._id,
          idempotencyKey: cleanIdempotencyKey,
        });
        if (byKey) return { appointment: byKey, idempotent: true };
      }
      throw new ApiError(
        409,
        "Selected time slot conflicts with an existing confirmed appointment or active pending reservation."
      );
    }
    throw err;
  }

  // Post-insert scheduleVersion re-check to guard against a concurrent availability edit
  const availAfter = await WorkerAvailability.findOne({ workerId: workerProfile._id }).lean();
  const workerAfter = await WorkerProfile.findById(workerProfile._id).select("availability").lean();
  if (
    workerAfter?.availability === "unavailable" ||
    (availAfter &&
      availAfter.scheduleVersion !== versionBefore &&
      !isWithinAvailability({
        startAt: startDate,
        endAt: endDate,
        timeZone: availAfter.timeZone,
        weekly: availAfter.weekly,
        exceptions: availAfter.exceptions,
      }))
  ) {
    await Appointment.deleteOne({ _id: created._id });
    throw new ApiError(
      409,
      "Worker availability was updated concurrently and this slot is no longer available."
    );
  }

  notifyAppointmentEvent("APPOINTMENT_REQUESTED", created, {
    workerProfile,
    employerProfile,
  }).catch((err) => logger.warn("Best-effort request notification failed", err?.message));

  return { appointment: created, idempotent: false };
}

/**
 * Worker accepts a pending appointment request.
 * Enforces ownership, expiry, and atomic state transition.
 */
export async function acceptAppointment({ workerUser, appointmentId, now = new Date() }) {
  if (!mongoose.isValidObjectId(appointmentId)) {
    throw new ApiError(400, "Invalid appointment ID format");
  }

  const workerProfile = await WorkerProfile.findOne({ userId: workerUser._id });
  if (!workerProfile) {
    throw new ApiError(404, "Worker profile not found");
  }

  const existing = await Appointment.findById(appointmentId);
  if (!existing) {
    throw new ApiError(404, "Appointment not found");
  }

  if (String(existing.workerId) !== String(workerProfile._id)) {
    throw new ApiError(403, "Forbidden: You can only accept appointments addressed to your worker profile");
  }

  // Idempotent return on repeated accept calls
  if (existing.status === APPOINTMENT_STATUS.CONFIRMED) {
    return existing;
  }

  if (existing.status !== APPOINTMENT_STATUS.PENDING) {
    throw new ApiError(409, `Cannot accept an appointment that is ${existing.status}`);
  }

  if (existing.expiresAt && new Date(existing.expiresAt).getTime() <= now.getTime()) {
    await sweepExpiredPendingAppointments({ _id: existing._id }, now);
    throw new ApiError(409, "This appointment request has expired and can no longer be accepted");
  }

  // Release any other expired pending appointments on this worker before confirming
  await sweepExpiredPendingAppointments({ workerId: workerProfile._id }, now);

  const slotKeys = computeSlotKeys(workerProfile._id, existing.startAt, existing.endAt);

  let updated;
  try {
    updated = await Appointment.findOneAndUpdate(
      {
        _id: existing._id,
        workerId: workerProfile._id,
        status: APPOINTMENT_STATUS.PENDING,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      {
        $set: {
          status: APPOINTMENT_STATUS.CONFIRMED,
          confirmedAt: now,
          activeSlotKeys: slotKeys,
        },
      },
      { returnDocument: "after" }
    );
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "Cannot accept this appointment because it overlaps with another confirmed appointment");
    }
    throw err;
  }

  if (!updated) {
    const fresh = await Appointment.findById(existing._id);
    if (fresh?.status === APPOINTMENT_STATUS.CONFIRMED) {
      return fresh;
    }
    throw new ApiError(
      409,
      `Appointment could not be confirmed (current status: ${fresh?.status || "unknown"})`
    );
  }

  notifyAppointmentEvent("APPOINTMENT_CONFIRMED", updated, { workerProfile }).catch((err) =>
    logger.warn("Best-effort confirmation notification failed", err?.message)
  );

  return updated;
}

/**
 * Worker rejects a pending appointment request, releasing its reserved slots.
 */
export async function rejectAppointment({ workerUser, appointmentId, reason = "", now = new Date() }) {
  if (!mongoose.isValidObjectId(appointmentId)) {
    throw new ApiError(400, "Invalid appointment ID format");
  }

  const workerProfile = await WorkerProfile.findOne({ userId: workerUser._id });
  if (!workerProfile) {
    throw new ApiError(404, "Worker profile not found");
  }

  const existing = await Appointment.findById(appointmentId);
  if (!existing) {
    throw new ApiError(404, "Appointment not found");
  }

  if (String(existing.workerId) !== String(workerProfile._id)) {
    throw new ApiError(403, "Forbidden: You can only reject appointments addressed to your worker profile");
  }

  if (existing.status === APPOINTMENT_STATUS.REJECTED) {
    return existing;
  }

  if (existing.status !== APPOINTMENT_STATUS.PENDING) {
    throw new ApiError(409, `Cannot reject an appointment that is ${existing.status}`);
  }

  const cleanReason = sanitizeText(reason, 300);

  const updated = await Appointment.findOneAndUpdate(
    {
      _id: existing._id,
      workerId: workerProfile._id,
      status: APPOINTMENT_STATUS.PENDING,
    },
    {
      $set: {
        status: APPOINTMENT_STATUS.REJECTED,
        rejectedAt: now,
        rejectionReason: cleanReason,
      },
      $unset: { activeSlotKeys: 1 },
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    const fresh = await Appointment.findById(existing._id);
    if (fresh?.status === APPOINTMENT_STATUS.REJECTED) return fresh;
    throw new ApiError(409, `Appointment could not be rejected (current status: ${fresh?.status || "unknown"})`);
  }

  notifyAppointmentEvent("APPOINTMENT_REJECTED", updated, { workerProfile }).catch((err) =>
    logger.warn("Best-effort rejection notification failed", err?.message)
  );

  return updated;
}

/**
 * Authorized participant (worker or employer) cancels a pending or confirmed
 * appointment, immediately releasing its slots.
 */
export async function cancelAppointment({ user, appointmentId, reason = "", now = new Date() }) {
  if (!mongoose.isValidObjectId(appointmentId)) {
    throw new ApiError(400, "Invalid appointment ID format");
  }

  const [workerProfile, employerProfile, existing] = await Promise.all([
    WorkerProfile.findOne({ userId: user._id }),
    EmployerProfile.findOne({ userId: user._id }),
    Appointment.findById(appointmentId),
  ]);

  if (!existing) {
    throw new ApiError(404, "Appointment not found");
  }

  const isOwningWorker = workerProfile && String(existing.workerId) === String(workerProfile._id);
  const isOwningEmployer = employerProfile && String(existing.employerId) === String(employerProfile._id);

  if (!isOwningWorker && !isOwningEmployer) {
    throw new ApiError(403, "Forbidden: You are not an authorized participant of this appointment");
  }

  if (existing.status === APPOINTMENT_STATUS.CANCELLED) {
    return existing;
  }

  if (![APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED].includes(existing.status)) {
    throw new ApiError(409, `Cannot cancel an appointment that is ${existing.status}`);
  }

  const cancelledByRole = isOwningWorker ? "worker" : "employer";
  const cleanReason = sanitizeText(reason, 300);

  const updated = await Appointment.findOneAndUpdate(
    {
      _id: existing._id,
      status: { $in: [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED] },
    },
    {
      $set: {
        status: APPOINTMENT_STATUS.CANCELLED,
        cancelledAt: now,
        cancelledByRole,
        cancellationReason: cleanReason,
      },
      $unset: { activeSlotKeys: 1 },
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    const fresh = await Appointment.findById(existing._id);
    if (fresh?.status === APPOINTMENT_STATUS.CANCELLED) return fresh;
    throw new ApiError(409, `Appointment could not be cancelled (current status: ${fresh?.status || "unknown"})`);
  }

  notifyAppointmentEvent("APPOINTMENT_CANCELLED", updated, {
    workerProfile,
    employerProfile,
    cancelledByRole,
  }).catch((err) => logger.warn("Best-effort cancellation notification failed", err?.message));

  return updated;
}

/**
 * Authorized participant marks a confirmed appointment as completed.
 */
export async function completeAppointment({ user, appointmentId, now = new Date() }) {
  if (!mongoose.isValidObjectId(appointmentId)) {
    throw new ApiError(400, "Invalid appointment ID format");
  }

  const [workerProfile, employerProfile, existing] = await Promise.all([
    WorkerProfile.findOne({ userId: user._id }),
    EmployerProfile.findOne({ userId: user._id }),
    Appointment.findById(appointmentId),
  ]);

  if (!existing) {
    throw new ApiError(404, "Appointment not found");
  }

  const isOwningWorker = workerProfile && String(existing.workerId) === String(workerProfile._id);
  const isOwningEmployer = employerProfile && String(existing.employerId) === String(employerProfile._id);

  if (!isOwningWorker && !isOwningEmployer) {
    throw new ApiError(403, "Forbidden: You are not an authorized participant of this appointment");
  }

  if (existing.status === APPOINTMENT_STATUS.COMPLETED) {
    return existing;
  }

  if (existing.status !== APPOINTMENT_STATUS.CONFIRMED) {
    throw new ApiError(409, `Only confirmed appointments can be marked as completed (current status: ${existing.status})`);
  }

  const updated = await Appointment.findOneAndUpdate(
    {
      _id: existing._id,
      status: APPOINTMENT_STATUS.CONFIRMED,
    },
    {
      $set: {
        status: APPOINTMENT_STATUS.COMPLETED,
        completedAt: now,
      },
      $unset: { activeSlotKeys: 1 },
    },
    { returnDocument: "after" }
  );

  return updated || (await Appointment.findById(existing._id));
}

async function notifyAppointmentEvent(templateKey, appointment, context = {}) {
  try {
    const workerProfile =
      context.workerProfile || (await WorkerProfile.findById(appointment.workerId).lean());
    const employerProfile =
      context.employerProfile || (await EmployerProfile.findById(appointment.employerId).lean());

    if (!workerProfile || !employerProfile) return;

    const when = formatAppointmentWhen(appointment.startAt, appointment.endAt, appointment.timeZone);
    const workerName = workerProfile.fullName || "Worker";
    const employerName = employerProfile.businessName || "Employer";

    let recipientUserId = null;
    let link = "/notifications";
    let actorName = "";

    if (templateKey === "APPOINTMENT_REQUESTED") {
      recipientUserId = workerProfile.userId;
      link = "/worker-availability";
    } else if (
      templateKey === "APPOINTMENT_CONFIRMED" ||
      templateKey === "APPOINTMENT_REJECTED" ||
      templateKey === "APPOINTMENT_EXPIRED"
    ) {
      recipientUserId = employerProfile.userId;
      link = "/employer-appointments";
    } else if (templateKey === "APPOINTMENT_CANCELLED") {
      if (context.cancelledByRole === "worker") {
        recipientUserId = employerProfile.userId;
        link = "/employer-appointments";
        actorName = workerName;
      } else {
        recipientUserId = workerProfile.userId;
        link = "/worker-availability";
        actorName = employerName;
      }
    }

    if (!recipientUserId) return;

    await sendNotificationService({
      userId: recipientUserId,
      type: "application_update",
      templateKey,
      templateData: {
        kind: "appointment",
        appointmentId: String(appointment._id),
        status: appointment.status,
        startAt: new Date(appointment.startAt).toISOString(),
        endAt: new Date(appointment.endAt).toISOString(),
        durationMinutes: appointment.durationMinutes,
        when,
        workerName,
        employerName,
        actorName,
        link,
      },
      refId: appointment._id,
      idempotencyKey: `appointment_${templateKey.toLowerCase()}_${appointment._id}`,
    });
  } catch (err) {
    logger.warn("[notifyAppointmentEvent] Error sending notification", err?.message);
  }
}

