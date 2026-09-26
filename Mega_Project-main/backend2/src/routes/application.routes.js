import { Router } from "express";
import {
  applyForJob,
  withdrawApplication,
  getMyApplications,
  getJobApplicants,
  shortlistApplication,
  acceptOrRejectApplication,
  completeApplication,
} from "../controllers/application.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

router.use(verifyJWT);

// Worker endpoints
router.post("/apply", authorizeRoles("worker"), applyForJob);
router.post("/:applicationId/withdraw", authorizeRoles("worker"), withdrawApplication);
router.get("/mine", authorizeRoles("worker"), getMyApplications);

// Employer endpoints
router.get("/job/:jobId", authorizeRoles("employer", "admin"), getJobApplicants);
router.patch("/:applicationId/shortlist", authorizeRoles("employer", "admin"), shortlistApplication);
router.patch("/:applicationId/status", authorizeRoles("employer", "admin"), acceptOrRejectApplication);
router.patch("/:applicationId/complete", authorizeRoles("employer", "admin"), completeApplication);

export default router;
