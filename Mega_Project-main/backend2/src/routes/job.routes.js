import { Router } from "express";
import {
  createJob,
  updateJob,
  cancelJob,
  closeJob,
  getEmployerJobs,
  searchAndFilterJobs,
  getNearbyJobs,
  getRecommendedJobs,
  getRecommendedWorkers,
} from "../controllers/job.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { languageMiddleware } from "../middlewares/language.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createJobValidator, updateJobValidator } from "../validators/job.validator.js";

const router = Router();

// Public / general routes
router.get("/search", languageMiddleware, searchAndFilterJobs);
router.get("/nearby", getNearbyJobs);

// Authenticated routes
router.use(verifyJWT);

// Worker recommended jobs
router.get("/recommended", authorizeRoles("worker"), getRecommendedJobs);

// Employer job routes
router.post("/", authorizeRoles("employer", "admin"), validate(createJobValidator), createJob);
router.get("/employer/mine", authorizeRoles("employer", "admin"), getEmployerJobs);
router.patch("/:jobId", authorizeRoles("employer", "admin"), validate(updateJobValidator), updateJob);
router.post("/:jobId/cancel", authorizeRoles("employer", "admin"), cancelJob);
router.post("/:jobId/close", authorizeRoles("employer", "admin"), closeJob);
router.get("/:jobId/recommended-workers", authorizeRoles("employer", "admin"), getRecommendedWorkers);

export default router;
