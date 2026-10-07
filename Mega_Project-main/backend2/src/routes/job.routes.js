import { Router } from "express";
import {
  createJob,
  getJobById,
  updateJob,
  cancelJob,
  closeJob,
  reopenJob,
  deleteJob,
  updateJobStatus,
  getEmployerJobs,
  searchAndFilterJobs,
  getNearbyJobs,
  getRecommendedJobs,
  getRecommendedWorkers,
  getJobEmployerContact,
} from "../controllers/job.controller.js";
import { verifyJWT, optionalVerifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { languageMiddleware } from "../middlewares/language.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createJobValidator,
  updateJobValidator,
  jobIdParamValidator,
  updateJobStatusValidator,
  reopenJobValidator,
} from "../validators/job.validator.js";

const router = Router();

// Public / general routes
router.get("/search", languageMiddleware, searchAndFilterJobs);
router.get("/nearby", getNearbyJobs);
// Literal paths MUST be registered before the "/:jobId" wildcard below:
// Express matches in registration order, so with "/:jobId" first a request
// for /jobs/recommended was captured as jobId="recommended" and rejected as
// an invalid id, which silently broke worker recommendations.
router.get("/recommended", verifyJWT, authorizeRoles("worker"), getRecommendedJobs);

router.get("/:jobId", optionalVerifyJWT, languageMiddleware, validate(jobIdParamValidator), getJobById);

// Authenticated routes
router.use(verifyJWT);

// Employer job routes
router.post("/", authorizeRoles("employer", "admin"), validate(createJobValidator), createJob);
router.get("/employer/mine", authorizeRoles("employer", "admin"), getEmployerJobs);
router.patch("/:jobId", authorizeRoles("employer", "admin"), validate(jobIdParamValidator), validate(updateJobValidator), updateJob);
router.patch("/:jobId/status", authorizeRoles("employer", "admin"), validate(updateJobStatusValidator), updateJobStatus);
router.post("/:jobId/cancel", authorizeRoles("employer", "admin"), validate(jobIdParamValidator), cancelJob);
router.post("/:jobId/close", authorizeRoles("employer", "admin"), validate(jobIdParamValidator), closeJob);
router.post("/:jobId/reopen", authorizeRoles("employer", "admin"), validate(reopenJobValidator), reopenJob);
router.delete("/:jobId", authorizeRoles("employer", "admin"), validate(jobIdParamValidator), deleteJob);
// Gated: released only to a worker whose application/job request for this job
// has been accepted. See getJobEmployerContact for the privacy boundary.
router.get(
  "/:jobId/employer-contact",
  authorizeRoles("worker", "admin"),
  validate(jobIdParamValidator),
  getJobEmployerContact
);
router.get("/:jobId/recommended-workers", authorizeRoles("employer", "admin"), validate(jobIdParamValidator), getRecommendedWorkers);

export default router;
