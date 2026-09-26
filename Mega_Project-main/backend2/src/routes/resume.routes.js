import { Router } from "express";
import {
  getResume,
  editResume,
  generateFromVoice,
  publishOrArchive,
  exportPDF,
} from "../controllers/resume.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("worker", "admin"));

router.get("/me", getResume);
router.put("/me", editResume);
router.post("/generate-from-voice", generateFromVoice);
router.patch("/status", publishOrArchive);
router.get("/export-pdf", exportPDF);

export default router;
