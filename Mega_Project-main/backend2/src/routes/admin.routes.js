import { Router } from "express";
import {
  getDashboardStats,
  getWorkers,
  getWorkerById,
  updateWorkerStatus,
  getEmployers,
  getEmployerById,
  verifyEmployer,
  updateEmployerStatus,
  getJobs,
  getJobById,
  moderateJob,
  getApplications,
  getApplicationById,
  getDisputes,
  getDisputeById,
  updateDisputeStatus,
  getRatings,
  moderateRating,
  getNotificationStats,
  sendAnnouncement,
  getAiServiceStatus,
  getAuditLogs,
  blockUser,
  unblockUser,
  flagUser,
  verifyDocument,
  verifyWorkerSkill,
} from "../controllers/admin.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

// Enforce authentication & admin authorization across all endpoints
router.use(verifyJWT);
router.use(authorizeRoles("admin"));

// Dashboard Overview
router.get("/dashboard-stats", getDashboardStats);

// Workers Management
router.get("/workers", getWorkers);
router.get("/workers/:id", getWorkerById);
router.patch("/workers/:id/status", updateWorkerStatus);

// Employers Management
router.get("/employers", getEmployers);
router.get("/employers/:id", getEmployerById);
router.patch("/employers/:id/verify", verifyEmployer);
router.patch("/employers/:id/status", updateEmployerStatus);

// Jobs Management & Moderation
router.get("/jobs", getJobs);
router.get("/jobs/:id", getJobById);
router.patch("/jobs/:id/moderate", moderateJob);

// Applications Overview
router.get("/applications", getApplications);
router.get("/applications/:id", getApplicationById);

// Reports & Complaints (Disputes)
router.get("/disputes", getDisputes);
router.get("/disputes/:id", getDisputeById);
router.patch("/disputes/:id/status", updateDisputeStatus);

// Ratings & Reviews Moderation
router.get("/ratings", getRatings);
router.patch("/ratings/:id/moderate", moderateRating);

// Notifications & Platform Announcements
router.get("/notifications/stats", getNotificationStats);
router.post("/announcements", sendAnnouncement);

// AI Service Monitoring
router.get("/ai-service/status", getAiServiceStatus);

// Audit Logs
router.get("/audit-logs", getAuditLogs);

// Backward-compatible individual endpoints
router.patch("/users/:userId/block", blockUser);
router.patch("/users/:userId/unblock", unblockUser);
router.patch("/users/:userId/flag", flagUser);
router.patch("/documents/:docId/verify", verifyDocument);
router.patch("/skills/:skillId/verify", verifyWorkerSkill);

export default router;
