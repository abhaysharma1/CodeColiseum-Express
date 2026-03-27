import { Router } from "express";
import { isLoggedIn } from "@/middleware/isLoggedin.middleware";
import {
  createNotificationHandler,
  getNotifications,
  getSentNotifications,
  markAllNotificationsAsRead,
  markNotificationsAsRead,
} from "@/controllers/notifications.controllers";

const router = Router();

router.use(isLoggedIn);

// GET /api/notifications
router.get("/", getNotifications);

// GET /api/notifications/sent
router.get("/sent", getSentNotifications);

// PATCH /api/notifications/read
router.patch("/read", markNotificationsAsRead);

// PATCH /api/notifications/read-all
router.patch("/read-all", markAllNotificationsAsRead);

// POST /api/notifications
router.post("/", createNotificationHandler);

export default router;
