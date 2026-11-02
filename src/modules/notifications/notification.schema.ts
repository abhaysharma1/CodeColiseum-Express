import { z } from "zod";
import {
  NotificationPriority,
  NotificationType,
} from "../../../generated/prisma/enums";

const notificationTypes = Object.values(
  NotificationType,
) as [NotificationType, ...NotificationType[]];
const notificationPriorities = Object.values(
  NotificationPriority,
) as [NotificationPriority, ...NotificationPriority[]];

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  isRead: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  type: z.enum(notificationTypes).optional(),
  priority: z.enum(notificationPriorities).optional(),
});

export const listSentNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(notificationTypes).optional(),
});

export const markNotificationsReadSchema = z.object({
  recipientIds: z.array(z.string().trim().min(1)).optional(),
});

export const createNotificationSchema = z.object({
  title: z.string().trim().min(1, "title, message and type are required"),
  message: z.string().trim().min(1, "title, message and type are required"),
  type: z.enum(notificationTypes),
  priority: z.enum(notificationPriorities).optional(),
  examId: z.string().trim().min(1).optional(),
  groupId: z.string().trim().min(1).optional(),
  groupIds: z.array(z.string().trim().min(1)).optional(),
  recipientIds: z.array(z.string().trim().min(1)).optional(),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
export type ListSentNotificationsQuery = z.infer<
  typeof listSentNotificationsQuerySchema
>;
export type MarkNotificationsReadInput = z.infer<
  typeof markNotificationsReadSchema
>;
export type CreateNotificationInput = z.infer<
  typeof createNotificationSchema
>;
