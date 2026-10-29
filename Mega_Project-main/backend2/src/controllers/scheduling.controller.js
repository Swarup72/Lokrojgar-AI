import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import WorkerProfile from "../models/workerProfile.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import Appointment from "../models/appointment.model.js";
import {
  acceptAppointment,
  addAvailabilityException,
  cancelAppointment,
  completeAppointment,
  createAppointmentRequest,
  getOrCreateWorkerAvailability,
  getWorkerAvailabilityRange,
  rejectAppointment,
  removeAvailabilityException,
  sweepExpiredPendingAppointments,
  updateWorkerWeeklyAvailability,
} from "../services/scheduling.service.js";

async function requireOwnWorkerProfile(userId) {
  const profile = await WorkerProfile.findOne({ userId });
  if (!profile) {
    throw new ApiError(404, "Worker profile not found. Please complete your worker profile first.");
  }
  return profile;
}

export const getMyAvailability = asyncHandler(async (req, res) => {
  const workerProfile = await requireOwnWorkerProfile(req.user._id);
  await sweepExpiredPendingAppointments({ workerId: workerProfile._id });
  const availability = await getOrCreateWorkerAvailability(workerProfile._id);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        workerId: String(workerProfile._id),
        coarseAvailability: workerProfile.availability || "available",
        timeZone: availability.timeZone,
        weekly: availability.weekly,
        exceptions: availability.exceptions,
        scheduleVersion: availability.scheduleVersion,
        updatedAt: availability.updatedAt,
      },
      "Worker availability retrieved successfully"
    )
  );
});

export const putMyAvailability = asyncHandler(async (req, res) => {
  const workerProfile = await requireOwnWorkerProfile(req.user._id);
  const { timeZone, weekly, acknowledgeConfirmedConflicts } = req.body;

  const updated = await updateWorkerWeeklyAvailability(workerProfile._id, {
    timeZone,
    weekly,
    acknowledgeConfirmedConflicts: Boolean(acknowledgeConfirmedConflicts),
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        workerId: String(workerProfile._id),
        coarseAvailability: workerProfile.availability || "available",
        timeZone: updated.timeZone,
        weekly: updated.weekly,
        exceptions: updated.exceptions,
        scheduleVersion: updated.scheduleVersion,
        updatedAt: updated.updatedAt,
      },
      "Weekly availability updated successfully"
    )
  );
});

export const postMyAvailabilityException = asyncHandler(async (req, res) => {
  const workerProfile = await requireOwnWorkerProfile(req.user._id);
  const { date, type, start, end, reason, acknowledgeConfirmedConflicts } = req.body;

  const updated = await addAvailabilityException(
    workerProfile._id,
    { date, type, start, end, reason },
    { acknowledgeConfirmedConflicts: Boolean(acknowledgeConfirmedConflicts) }
  );

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        workerId: String(workerProfile._id),
        timeZone: updated.timeZone,
        weekly: updated.weekly,
        exceptions: updated.exceptions,
        scheduleVersion: updated.scheduleVersion,
      },
      "Availability exception added successfully"
    )
  );
});

export const deleteMyAvailabilityException = asyncHandler(async (req, res) => {
  const workerProfile = await requireOwnWorkerProfile(req.user._id);
  const { exceptionId } = req.params;

  const updated = await removeAvailabilityException(workerProfile._id, exceptionId);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        workerId: String(workerProfile._id),
        timeZone: updated.timeZone,
        weekly: updated.weekly,
        exceptions: updated.exceptions,
        scheduleVersion: updated.scheduleVersion,
      },
      "Availability exception removed successfully"
    )
  );
});

export const getWorkerAvailabilityPublic = asyncHandler(async (req, res) => {
  const { workerId } = req.params;
  if (!mongoose.isValidObjectId(workerId)) {
    throw new ApiError(400, "Invalid worker ID format");
  }
  const { from, to } = req.query || {};
  const data = await getWorkerAvailabilityRange(workerId, { from, to });

  return res.status(200).json(new ApiResponse(200, data, "Worker availability schedule retrieved"));
});

async function populateAppointmentDoc(doc) {
  if (!doc) return null;
  await Appointment.populate(doc, [
    { path: "workerId", select: "fullName city profilePhoto availability experienceYears ratingAvg ratingCount" },
    {
      path: "employerId",
      select: "businessName businessType city village ratingAvg ratingCount userId",
      populate: { path: "userId", select: "fullName" },
    },
    { path: "jobId", select: "title payAmount payType status originalLanguage" },
  ]);
  const plain = doc.toObject ? doc.toObject() : { ...doc };
  delete plain.activeSlotKeys;
  return plain;
}

export const createAppointment = asyncHandler(async (req, res) => {
  const { workerId, jobId, startAt, durationMinutes, purpose, idempotencyKey } = req.body;

  const { appointment, idempotent } = await createAppointmentRequest({
    employerUser: req.user,
    workerId,
    jobId,
    startAt,
    durationMinutes,
    purpose,
    idempotencyKey,
  });

  const populated = await populateAppointmentDoc(appointment);
  const statusCode = idempotent ? 200 : 201;

  return res
    .status(statusCode)
    .json(
      new ApiResponse(
        statusCode,
        populated,
        idempotent ? "Existing pending appointment returned" : "Appointment request submitted"
      )
    );
});

export const listAppointments = asyncHandler(async (req, res) => {
  const { role, status, from, to } = req.query || {};

  const [workerProfile, employerProfile] = await Promise.all([
    WorkerProfile.findOne({ userId: req.user._id }).select("_id").lean(),
    EmployerProfile.findOne({ userId: req.user._id }).select("_id").lean(),
  ]);

  let roleFilter;
  if (role === "worker") {
    if (!workerProfile) {
      return res.status(200).json(new ApiResponse(200, [], "Appointments retrieved"));
    }
    await sweepExpiredPendingAppointments({ workerId: workerProfile._id });
    roleFilter = { workerId: workerProfile._id };
  } else if (role === "employer") {
    if (!employerProfile) {
      return res.status(200).json(new ApiResponse(200, [], "Appointments retrieved"));
    }
    await sweepExpiredPendingAppointments({ employerId: employerProfile._id });
    roleFilter = { employerId: employerProfile._id };
  } else {
    const clauses = [];
    if (workerProfile) {
      await sweepExpiredPendingAppointments({ workerId: workerProfile._id });
      clauses.push({ workerId: workerProfile._id });
    }
    if (employerProfile) {
      await sweepExpiredPendingAppointments({ employerId: employerProfile._id });
      clauses.push({ employerId: employerProfile._id });
    }
    if (clauses.length === 0) {
      return res.status(200).json(new ApiResponse(200, [], "Appointments retrieved"));
    }
    roleFilter = clauses.length === 1 ? clauses[0] : { $or: clauses };
  }

  const filter = { ...roleFilter };
  if (status) {
    filter.status = status;
  }
  if (from || to) {
    filter.startAt = {};
    if (from) {
      const f = new Date(from);
      if (!Number.isNaN(f.getTime())) filter.startAt.$gte = f;
    }
    if (to) {
      const t = new Date(to);
      if (!Number.isNaN(t.getTime())) filter.startAt.$lte = t;
    }
    if (Object.keys(filter.startAt).length === 0) delete filter.startAt;
  }

  const docs = await Appointment.find(filter)
    .select("-activeSlotKeys")
    .populate("workerId", "fullName city profilePhoto availability experienceYears ratingAvg ratingCount")
    .populate({
      path: "employerId",
      select: "businessName businessType city village ratingAvg ratingCount userId",
      populate: { path: "userId", select: "fullName" },
    })
    .populate("jobId", "title payAmount payType status originalLanguage")
    .sort({ startAt: 1, createdAt: -1 })
    .lean();

  return res.status(200).json(new ApiResponse(200, docs, "Appointments retrieved successfully"));
});

export const getAppointmentById = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  if (!mongoose.isValidObjectId(appointmentId)) {
    throw new ApiError(400, "Invalid appointment ID format");
  }

  const [workerProfile, employerProfile, doc] = await Promise.all([
    WorkerProfile.findOne({ userId: req.user._id }).select("_id").lean(),
    EmployerProfile.findOne({ userId: req.user._id }).select("_id").lean(),
    Appointment.findById(appointmentId),
  ]);

  if (!doc) {
    throw new ApiError(404, "Appointment not found");
  }

  const isParticipant =
    (workerProfile && String(doc.workerId) === String(workerProfile._id)) ||
    (employerProfile && String(doc.employerId) === String(employerProfile._id)) ||
    (req.user.roles || []).includes("admin");

  // Return 404 to non-participants to prevent appointment ID enumeration
  if (!isParticipant) {
    throw new ApiError(404, "Appointment not found");
  }

  await sweepExpiredPendingAppointments({ _id: doc._id });
  const fresh = await Appointment.findById(doc._id);
  const populated = await populateAppointmentDoc(fresh);

  return res.status(200).json(new ApiResponse(200, populated, "Appointment retrieved successfully"));
});

export const acceptAppointmentHandler = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const updated = await acceptAppointment({
    workerUser: req.user,
    appointmentId,
  });
  const populated = await populateAppointmentDoc(updated);

  return res.status(200).json(new ApiResponse(200, populated, "Appointment confirmed"));
});

export const rejectAppointmentHandler = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { reason } = req.body || {};
  const updated = await rejectAppointment({
    workerUser: req.user,
    appointmentId,
    reason,
  });
  const populated = await populateAppointmentDoc(updated);

  return res.status(200).json(new ApiResponse(200, populated, "Appointment request declined"));
});

export const cancelAppointmentHandler = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { reason } = req.body || {};
  const updated = await cancelAppointment({
    user: req.user,
    appointmentId,
    reason,
  });
  const populated = await populateAppointmentDoc(updated);

  return res.status(200).json(new ApiResponse(200, populated, "Appointment cancelled"));
});

export const completeAppointmentHandler = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const updated = await completeAppointment({
    user: req.user,
    appointmentId,
  });
  const populated = await populateAppointmentDoc(updated);

  return res.status(200).json(new ApiResponse(200, populated, "Appointment marked as completed"));
});

