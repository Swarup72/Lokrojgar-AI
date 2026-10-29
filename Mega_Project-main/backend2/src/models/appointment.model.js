import mongoose from "mongoose";
import { DEFAULT_TIME_ZONE, SLOT_MS } from "../utils/scheduling/time.js";

export const APPOINTMENT_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  COMPLETED: "completed",
};

export const SUPPORTED_DURATIONS_MINUTES = [15, 30, 45, 60, 90, 120];
export const DEFAULT_RESERVATION_MINUTES = 120; // 2 hours bounded reservation for pending requests

/**
 * Generates the discrete 15-minute slot keys covering [startAt, endAt).
 * Each key is `${workerId}_${slotStartMs}`.
 * When stored in `activeSlotKeys` under a partial unique multikey index for
 * status in ["pending", "confirmed"], MongoDB atomically prevents ANY two
 * overlapping appointments for the same worker from coexisting.
 */
export function computeSlotKeys(workerId, startAt, endAt) {
  const wId = String(workerId);
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const keys = [];
  for (let t = startMs; t < endMs; t += SLOT_MS) {
    keys.push(`${wId}_${t}`);
  }
  return keys;
}

const appointmentSchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
      index: true,
    },
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployerProfile",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    startAt: {
      type: Date,
      required: true,
      index: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      enum: SUPPORTED_DURATIONS_MINUTES,
      required: true,
    },
    timeZone: {
      type: String,
      default: DEFAULT_TIME_ZONE,
      required: true,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: Object.values(APPOINTMENT_STATUS),
      default: APPOINTMENT_STATUS.PENDING,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    activeSlotKeys: {
      type: [String],
      default: undefined,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: undefined,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledByRole: {
      type: String,
      enum: ["worker", "employer", "system", null],
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    expiredAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Atomic overlap & double-booking guard at the storage-engine level
appointmentSchema.index(
  { activeSlotKeys: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED] },
      activeSlotKeys: { $type: "string" },
    },
  }
);

appointmentSchema.index({ workerId: 1, startAt: 1, endAt: 1 });
appointmentSchema.index({ employerId: 1, startAt: 1, endAt: 1 });
appointmentSchema.index({ status: 1, expiresAt: 1 });
appointmentSchema.index(
  { employerId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);

const Appointment = mongoose.model("Appointment", appointmentSchema);

export default Appointment;
