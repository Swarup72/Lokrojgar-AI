import { Router } from "express";
import {
  getMe,
  updateLanguagePreference,
  deleteAccount,
  registerDeviceToken,
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.get("/me", getMe);
router.patch("/language", updateLanguagePreference);
router.delete("/account", deleteAccount);
router.post("/device-token", registerDeviceToken);

export default router;
