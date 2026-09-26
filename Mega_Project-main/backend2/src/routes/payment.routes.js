import { Router } from "express";
import {
  recordCashOrUPI,
  createRazorpayOrderEndpoint,
  verifyRazorpayPaymentEndpoint,
  handleRazorpayWebhook,
  markPaymentPaid,
  getPaymentHistory,
  processRefund,
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

// Public webhook route (no auth header)
router.post("/razorpay/webhook", handleRazorpayWebhook);

// Authenticated routes
router.use(verifyJWT);

router.post("/record-offline", recordCashOrUPI);
router.post("/razorpay/order", createRazorpayOrderEndpoint);
router.post("/razorpay/verify", verifyRazorpayPaymentEndpoint);
router.get("/history", getPaymentHistory);
router.patch("/:paymentId/mark-paid", authorizeRoles("employer", "admin"), markPaymentPaid);
router.post("/:paymentId/refund", authorizeRoles("admin"), processRefund);

export default router;
