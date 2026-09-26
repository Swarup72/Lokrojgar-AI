import { Router } from "express";
import {
  getEmployerProfile,
  createOrUpdateProfile,
  uploadPhoto,
  updateBusinessDetails,
} from "../controllers/employerProfile.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadImage } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("employer", "admin"));

router.get("/me", getEmployerProfile);
router.post("/", createOrUpdateProfile);
router.post("/photo", uploadImage.single("photo"), uploadPhoto);
router.patch("/business", updateBusinessDetails);

export default router;
