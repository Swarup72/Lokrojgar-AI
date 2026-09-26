import Shift from "../models/shift.model.js";
import Job from "../models/job.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isWithinRadius } from "../utils/geo.js";

export const scheduleShift = asyncHandler(async (req, res) => {
  const { jobId, workerId, shiftDate, startTime, endTime } = req.body;

  const job = await Job.findById(jobId);
  if (!job) throw new ApiError(404, "Job not found");

  const shift = await Shift.create({
    jobId,
    workerId,
    shiftDate: new Date(shiftDate),
    startTime,
    endTime,
    status: "scheduled",
  });

  return res.status(201).json(new ApiResponse(201, shift, "Shift scheduled successfully"));
});

export const checkInShift = asyncHandler(async (req, res) => {
  const { shiftId } = req.params;
  const { coordinates } = req.body; // [lng, lat]

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const shift = await Shift.findOne({ _id: shiftId, workerId: workerProfile._id }).populate("jobId");
  if (!shift) throw new ApiError(404, "Shift not found");

  if (shift.status !== "scheduled") {
    throw new ApiError(400, `Cannot check-in to shift with status ${shift.status}`);
  }

  // Location proximity check (within 1 km of job location)
  const jobCoords = shift.jobId.location?.coordinates;
  if (jobCoords && jobCoords.length === 2 && coordinates && coordinates.length === 2) {
    const isNearby = isWithinRadius(coordinates, jobCoords, 1.0);
    if (!isNearby) {
      throw new ApiError(400, "Check-in failed: You are too far from the job site (must be within 1km)");
    }
  }

  shift.checkInAt = new Date();
  shift.checkInLocation = { type: "Point", coordinates };
  await shift.save();

  return res.status(200).json(new ApiResponse(200, shift, "Checked in to shift successfully"));
});

export const checkOutShift = asyncHandler(async (req, res) => {
  const { shiftId } = req.params;

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const shift = await Shift.findOne({ _id: shiftId, workerId: workerProfile._id });
  if (!shift) throw new ApiError(404, "Shift not found");

  shift.checkOutAt = new Date();
  shift.status = "completed";
  await shift.save();

  return res.status(200).json(new ApiResponse(200, shift, "Checked out from shift successfully"));
});

export const getMissedShifts = asyncHandler(async (req, res) => {
  const now = new Date();
  const missedShifts = await Shift.find({
    status: "scheduled",
    shiftDate: { $lt: now },
  }).populate("jobId workerId");

  return res.status(200).json(new ApiResponse(200, missedShifts, "Missed shifts retrieved"));
});
