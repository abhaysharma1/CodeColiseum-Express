import { Router } from "express";
import { requireAuth } from "@/middleware/authentication";
import { validateRequest } from "@/middleware/validation";
import {
  createNotificationHandler,
  getNotifications,
  getSentNotifications,
  markAllNotificationsAsRead,
  markNotificationsAsRead,
} from "./notification.controller";
import {
  createNotificationSchema,
  listNotificationsQuerySchema,
  listSentNotificationsQuerySchema,
  markNotificationsReadSchema,
} from "./notification.schema";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validateRequest({ query: listNotificationsQuerySchema }),
  getNotifications,
);

router.get(
  "/sent",
  validateRequest({ query: listSentNotificationsQuerySchema }),
  getSentNotifications,
);

router.patch(
  "/read",
  validateRequest({ body: markNotificationsReadSchema }),
  markNotificationsAsRead,
);

router.patch("/read-all", markAllNotificationsAsRead);

router.post(
  "/",
  validateRequest({ body: createNotificationSchema }),
  createNotificationHandler,
);

export default router;
