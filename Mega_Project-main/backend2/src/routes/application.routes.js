import { Router } from "express";
import {
  applyForJob,
  withdrawApplication,
  getMyApplications,
  getJobApplicants,
  getApplicationById,
  shortlistApplication,
  acceptOrRejectApplication,
  completeApplication,
  inviteWorker,
  getMyInvitations,
  respondToInvitation,
} from "../controllers/application.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  applyForJobValidator,
  withdrawApplicationValidator,
  getJobApplicantsValidator,
  getApplicationByIdValidator,
  shortlistApplicationValidator,
  acceptOrRejectApplicationValidator,
  completeApplicationValidator,
  inviteWorkerValidator,
  respondToInvitationValidator,
} from "../validators/application.validator.js";

const router = Router();

router.use(verifyJWT);

// Worker endpoints
router.post("/apply", authorizeRoles("worker"), validate(applyForJobValidator), applyForJob);
router.post("/", authorizeRoles("worker"), validate(applyForJobValidator), applyForJob);
router.post("/:applicationId/withdraw", authorizeRoles("worker"), validate(withdrawApplicationValidator), withdrawApplication);
router.get("/mine", authorizeRoles("worker"), getMyApplications);
router.get("/my", authorizeRoles("worker"), getMyApplications);
// Incoming employer-initiated job requests, and the worker's answer. Both are
// worker-only: only the invited worker may respond, which the controller
// enforces against their own WorkerProfile, not against anything in the body.
// Registered BEFORE "/:applicationId" so the literal path is not captured by
// the wildcard (Express matches in registration order).
router.get("/invitations", authorizeRoles("worker"), getMyInvitations);
router.post(
  "/:applicationId/respond",
  authorizeRoles("worker"),
  validate(respondToInvitationValidator),
  respondToInvitation
);

// Employer endpoints
// Employer-initiated hiring. This is the ONLY way an employer starts a hiring
// relationship; the retired /offers routes were a parallel path that bypassed
// the capacity reservation (see routes/index.js).
router.post("/invite", authorizeRoles("employer", "admin"), validate(inviteWorkerValidator), inviteWorker);
router.get("/job/:jobId", authorizeRoles("employer", "admin"), validate(getJobApplicantsValidator), getJobApplicants);
router.patch("/:applicationId/shortlist", authorizeRoles("employer", "admin"), validate(shortlistApplicationValidator), shortlistApplication);
router.patch("/:applicationId/status", authorizeRoles("employer", "admin"), validate(acceptOrRejectApplicationValidator), acceptOrRejectApplication);
router.patch("/:applicationId/complete", authorizeRoles("employer", "admin"), validate(completeApplicationValidator), completeApplication);

// Shared authenticated view
router.get("/:applicationId", validate(getApplicationByIdValidator), getApplicationById);

export default router;
