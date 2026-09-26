import Offer from "../models/offer.model.js";
import EmployerProfile from "../models/employerProfile.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import Job from "../models/job.model.js";
import Application from "../models/application.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendNotificationService } from "../services/notification.service.js";

export const searchTalent = asyncHandler(async (req, res) => {
  const { availability = "available", categoryId, minRating = 0 } = req.query;

  const filter = { availability };
  if (categoryId) filter.preferredJobCategories = categoryId;
  if (minRating) filter.ratingAvg = { $gte: Number(minRating) };

  const workers = await WorkerProfile.find(filter)
    .populate("userId", "phone avatar")
    .limit(50);

  return res.status(200).json(new ApiResponse(200, workers, "Talent search results"));
});

export const sendOffer = asyncHandler(async (req, res) => {
  const { jobId, workerId, proposedPay, expiresInHours = 48 } = req.body;

  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });
  if (!employerProfile) throw new ApiError(404, "Employer profile not found");

  const job = await Job.findOne({ _id: jobId, employerId: employerProfile._id });
  if (!job) throw new ApiError(404, "Job not found or unauthorized");

  const worker = await WorkerProfile.findById(workerId);
  if (!worker) throw new ApiError(404, "Worker profile not found");

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const offer = await Offer.create({
    jobId,
    employerId: employerProfile._id,
    workerId,
    proposedPay: proposedPay || job.payAmount,
    status: "sent",
    expiresAt,
  });

  // Send notification to worker
  await sendNotificationService({
    userId: worker.userId,
    type: "JOB_OFFER",
    templateKey: "JOB_ALERT",
    templateData: {
      jobTitle: job.title?.en || "Job Offer",
      payAmount: offer.proposedPay,
      payType: job.payType,
    },
    refId: offer._id,
  });

  return res.status(201).json(new ApiResponse(201, offer, "Offer sent successfully"));
});

export const acceptOrRejectOffer = asyncHandler(async (req, res) => {
  const { offerId } = req.params;
  const { status } = req.body; // 'accepted' or 'rejected'

  if (!["accepted", "rejected"].includes(status)) {
    throw new ApiError(400, "Status must be accepted or rejected");
  }

  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const offer = await Offer.findOne({ _id: offerId, workerId: workerProfile._id, status: "sent" });
  if (!offer) throw new ApiError(404, "Active offer not found");

  if (offer.expiresAt < new Date()) {
    offer.status = "expired";
    await offer.save();
    throw new ApiError(400, "Offer has expired");
  }

  offer.status = status;
  await offer.save();

  if (status === "accepted") {
    // Automatically create application with accepted status
    await Application.create({
      jobId: offer.jobId,
      workerId: workerProfile._id,
      matchScore: 100,
      status: "accepted",
    });

    const job = await Job.findById(offer.jobId);
    if (job) {
      job.filledWorkers = (job.filledWorkers || 0) + 1;
      if (job.filledWorkers >= job.requiredWorkers) job.status = "assigned";
      else job.status = "partially_assigned";
      await job.save();
    }
  }

  return res.status(200).json(new ApiResponse(200, offer, `Offer ${status}`));
});

export const getMyOffers = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  const employerProfile = await EmployerProfile.findOne({ userId: req.user._id });

  let offers = [];
  if (workerProfile) {
    offers = await Offer.find({ workerId: workerProfile._id }).populate("jobId employerId").sort({ createdAt: -1 });
  } else if (employerProfile) {
    offers = await Offer.find({ employerId: employerProfile._id }).populate("jobId workerId").sort({ createdAt: -1 });
  }

  return res.status(200).json(new ApiResponse(200, offers, "Offers retrieved"));
});
