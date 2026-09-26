import { Router } from "express";
import {
  uploadAudioAndExtract,
  confirmAndApplyToProfile,
} from "../controllers/voiceProfile.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadAudio } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("worker", "admin"));

router.post("/extract", uploadAudio.single("audio"), uploadAudioAndExtract);
router.post("/confirm", confirmAndApplyToProfile);

export default router;
