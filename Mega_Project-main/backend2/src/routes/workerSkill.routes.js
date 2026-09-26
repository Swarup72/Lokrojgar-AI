import { Router } from "express";
import {
  getMySkills,
  addWorkerSkill,
  updateWorkerSkill,
  removeWorkerSkill,
  requestVerification,
  attachEvidenceJob,
} from "../controllers/workerSkill.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("worker", "admin"));

router.get("/mine", getMySkills);
router.post("/", addWorkerSkill);
router.patch("/:id", updateWorkerSkill);
router.delete("/:id", removeWorkerSkill);
router.post("/:id/verify-request", requestVerification);
router.post("/:id/evidence", attachEvidenceJob);

export default router;
