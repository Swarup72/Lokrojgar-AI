import { Router } from "express";

import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import workerProfileRoutes from "./workerProfile.routes.js";
import employerProfileRoutes from "./employerProfile.routes.js";
import categorySkillRoutes from "./categorySkill.routes.js";
import workerSkillRoutes from "./workerSkill.routes.js";
import documentRoutes from "./document.routes.js";
import voiceProfileRoutes from "./voiceProfile.routes.js";
import voiceJobRoutes from "./voiceJob.routes.js";
import resumeRoutes from "./resume.routes.js";
import jobRoutes from "./job.routes.js";
import applicationRoutes from "./application.routes.js";
import savedJobRoutes from "./savedJob.routes.js";
import shiftRoutes from "./shift.routes.js";
import paymentRoutes from "./payment.routes.js";
import ratingRoutes from "./rating.routes.js";
import disputeRoutes from "./dispute.routes.js";
import chatRoutes from "./chat.routes.js";
import notificationRoutes from "./notification.routes.js";
import adminRoutes from "./admin.routes.js";

const router = Router();

router.get("/status", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API v1 operational",
    timestamp: new Date().toISOString(),
  });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/worker-profile", workerProfileRoutes);
router.use("/employer-profile", employerProfileRoutes);
router.use("/catalog", categorySkillRoutes);
router.use("/worker-skills", workerSkillRoutes);
router.use("/documents", documentRoutes);
router.use("/voice-profile", voiceProfileRoutes);
router.use("/voice-job", voiceJobRoutes);
router.use("/resumes", resumeRoutes);
router.use("/jobs", jobRoutes);
router.use("/applications", applicationRoutes);
router.use("/saved-jobs", savedJobRoutes);
// NOTE: /offers is intentionally NOT mounted.
//
// It was a SECOND hiring path: POST /offers/send + PATCH /offers/:id/status,
// where accepting an offer created an Application{status:"accepted"} and called
// the UNCAPPED incrementFilledWorkers - bypassing the reserveWorkerSlot
// capacity reservation that /applications uses. Measured on an isolated
// database: three workers accepting offers for a job with requiredWorkers=1
// left filledWorkers=3 with 3 accepted applications. Concurrent duplicate
// offers returned 500 (an unhandled E11000 from the partial unique index), and
// GET /offers/search-talent returned every worker profile with their phone
// number populated, to any employer, with no hiring relationship.
//
// Employer-initiated hiring is now POST /applications/invite +
// POST /applications/:id/respond - the same Application document, the same
// unique {jobId, workerId} index, and the same atomic capacity reservation as a
// worker's own application. The Offer collection held 0 documents, so nothing
// was lost, and the model, controller, routes and cron sweep have since been
// deleted outright. This note stays as the record of why /offers is absent.
router.use("/shifts", shiftRoutes);
router.use("/payments", paymentRoutes);
router.use("/ratings", ratingRoutes);
router.use("/disputes", disputeRoutes);
router.use("/chat", chatRoutes);
router.use("/notifications", notificationRoutes);
router.use("/admin", adminRoutes);

export default router;
