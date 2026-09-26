import { Router } from "express";
import {
  uploadDocument,
  listMyDocuments,
  verifyOrRejectDocument,
} from "../controllers/document.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/upload", upload.single("document"), uploadDocument);
router.get("/mine", listMyDocuments);
router.patch("/:id/verify", authorizeRoles("admin"), verifyOrRejectDocument);

export default router;
