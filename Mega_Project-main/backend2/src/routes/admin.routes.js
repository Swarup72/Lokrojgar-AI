import { Router } from "express";
import {
  getDashboardStats,
  blockUser,
  unblockUser,
  flagUser,
  verifyDocument,
  verifyWorkerSkill,
  moderateJob,
  getAuditLogs,
} from "../controllers/admin.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("admin"));

router.get("/dashboard-stats", getDashboardStats);
router.patch("/users/:userId/block", blockUser);
router.patch("/users/:userId/unblock", unblockUser);
router.patch("/users/:userId/flag", flagUser);
router.patch("/documents/:docId/verify", verifyDocument);
router.patch("/skills/:skillId/verify", verifyWorkerSkill);
router.patch("/jobs/:jobId/moderate", moderateJob);
router.get("/audit-logs", getAuditLogs);

export default router;
