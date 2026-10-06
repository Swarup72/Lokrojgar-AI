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
} from "../validators/application.validator.js";

const router = Router();

router.use(verifyJWT);

// Worker endpoints
router.post("/apply", authorizeRoles("worker"), validate(applyForJobValidator), applyForJob);
router.post("/", authorizeRoles("worker"), validate(applyForJobValidator), applyForJob);
router.post("/:applicationId/withdraw", authorizeRoles("worker"), validate(withdrawApplicationValidator), withdrawApplication);
router.get("/mine", authorizeRoles("worker"), getMyApplications);
router.get("/my", authorizeRoles("worker"), getMyApplications);

// Employer endpoints
router.get("/job/:jobId", authorizeRoles("employer", "admin"), validate(getJobApplicantsValidator), getJobApplicants);
router.patch("/:applicationId/shortlist", authorizeRoles("employer", "admin"), validate(shortlistApplicationValidator), shortlistApplication);
router.patch("/:applicationId/status", authorizeRoles("employer", "admin"), validate(acceptOrRejectApplicationValidator), acceptOrRejectApplication);
router.patch("/:applicationId/complete", authorizeRoles("employer", "admin"), validate(completeApplicationValidator), completeApplication);

// Shared authenticated view
router.get("/:applicationId", validate(getApplicationByIdValidator), getApplicationById);

export default router;
