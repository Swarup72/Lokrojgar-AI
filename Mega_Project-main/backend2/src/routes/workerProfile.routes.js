import { Router } from "express";
import {
  getWorkerProfile,
  createOrUpdateProfile,
  toggleAvailability,
  updateLocation,
  updateRadius,
  updateCategories,
  uploadPhoto,
} from "../controllers/workerProfile.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadImage } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("worker", "admin"));

router.get("/me", getWorkerProfile);
router.post("/", createOrUpdateProfile);
router.patch("/availability", toggleAvailability);
router.patch("/location", updateLocation);
router.patch("/radius", updateRadius);
router.patch("/categories", updateCategories);
router.post("/photo", uploadImage.single("photo"), uploadPhoto);

export default router;
