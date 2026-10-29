import mongoose from "mongoose";
import { DEFAULT_TIME_ZONE } from "../utils/scheduling/time.js";

export const DEFAULT_WEEKLY_SCHEDULE = [
  { weekday: 1, intervals: [{ start: "09:00", end: "18:00" }] },
  { weekday: 2, intervals: [{ start: "09:00", end: "18:00" }] },
  { weekday: 3, intervals: [{ start: "09:00", end: "18:00" }] },
  { weekday: 4, intervals: [{ start: "09:00", end: "18:00" }] },
  { weekday: 5, intervals: [{ start: "09:00", end: "18:00" }] },
  { weekday: 6, intervals: [{ start: "09:00", end: "18:00" }] },
  { weekday: 7, intervals: [] },
];

const intervalSubSchema = new mongoose.Schema(
  {
    start: { type: String, required: true, trim: true },
    end: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const weekdaySubSchema = new mongoose.Schema(
  {
    weekday: { type: Number, required: true, min: 1, max: 7 },
    intervals: { type: [intervalSubSchema], default: [] },
  },
  { _id: false }
);

const exceptionSubSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, trim: true }, // YYYY-MM-DD in worker's timeZone
    type: {
      type: String,
      enum: ["block_day", "block_range", "extra"],
      required: true,
    },
    start: { type: String, default: null },
    end: { type: String, default: null },
    reason: { type: String, trim: true, maxlength: 200, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const workerAvailabilitySchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
      required: true,
      unique: true,
      index: true,
    },
    timeZone: {
      type: String,
      default: DEFAULT_TIME_ZONE,
      required: true,
      trim: true,
    },
    weekly: {
      type: [weekdaySubSchema],
      default: () => DEFAULT_WEEKLY_SCHEDULE.map((d) => ({ weekday: d.weekday, intervals: [...d.intervals] })),
    },
    exceptions: {
      type: [exceptionSubSchema],
      default: [],
    },
    scheduleVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

workerAvailabilitySchema.index({ workerId: 1, "exceptions.date": 1 });

const WorkerAvailability = mongoose.model("WorkerAvailability", workerAvailabilitySchema);

export default WorkerAvailability;

