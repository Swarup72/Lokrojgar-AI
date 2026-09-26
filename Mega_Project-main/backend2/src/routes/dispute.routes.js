import { Router } from "express";
import {
  raiseDispute,
  getMyDisputes,
  addEvidence,
  resolveDispute,
} from "../controllers/dispute.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadImage } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/", raiseDispute);
router.get("/mine", getMyDisputes);
router.post("/:disputeId/evidence", uploadImage.single("evidence"), addEvidence);
router.patch("/:disputeId/resolve", authorizeRoles("admin"), resolveDispute);

export default router;
