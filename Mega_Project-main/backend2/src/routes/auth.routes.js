import { Router } from "express";
import {
  sendOTP,
  verifyOTP,
  register,
  login,
  logout,
  refreshAccessToken,
  changePassword,
  resetPassword,
  listSessions,
  revokeSession,
  addRole,
} from "../controllers/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  sendOTPValidator,
  verifyOTPValidator,
  registerValidator,
  loginValidator,
  changePasswordValidator,
  resetPasswordValidator,
} from "../validators/auth.validator.js";
import { otpRateLimiter, loginRateLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = Router();

router.post("/send-otp", otpRateLimiter, validate(sendOTPValidator), sendOTP);
router.post("/verify-otp", validate(verifyOTPValidator), verifyOTP);
router.post("/register", validate(registerValidator), register);
router.post("/login", loginRateLimiter, validate(loginValidator), login);
router.post("/logout", verifyJWT, logout);
router.post("/refresh-token", refreshAccessToken);
router.post("/change-password", verifyJWT, validate(changePasswordValidator), changePassword);
router.post("/reset-password", validate(resetPasswordValidator), resetPassword);
router.get("/sessions", verifyJWT, listSessions);
router.post("/sessions/:sessionId/revoke", verifyJWT, revokeSession);
router.post("/add-role", verifyJWT, addRole);

export default router;
