import { Router } from "express";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notification.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { languageMiddleware } from "../middlewares/language.middleware.js";

const router = Router();

router.use(verifyJWT);

router.get("/", languageMiddleware, getNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/:id/read", markNotificationRead);
router.patch("/read-all", markAllNotificationsRead);

export default router;
