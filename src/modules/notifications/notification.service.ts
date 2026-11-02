import { NotificationPriority } from "../../../generated/prisma/client";
import {
  ForbiddenError,
  ValidationError,
} from "@/shared/errors";
import { buildPaginationMeta } from "@/shared/http/pagination";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import { findUserGlobalRole } from "@/modules/users/user.repository";
import * as notificationRepository from "./notification.repository";
import type {
  CreateNotificationInput,
  ListNotificationsQuery,
  ListSentNotificationsQuery,
  MarkNotificationsReadInput,
} from "./notification.schema";

const NOTIFICATION_SENDER_ROLES: readonly string[] = [
  GLOBAL_ROLE_IDS.PLATFORM_ADMIN,
  GLOBAL_ROLE_IDS.ORG_TEACHER,
];

async function assertCanSendNotifications(userId: string): Promise<void> {
  const role = await findUserGlobalRole(userId);

  if (!role || !NOTIFICATION_SENDER_ROLES.includes(role)) {
    throw new ForbiddenError("Forbidden");
  }
}

export async function getUserNotifications(
  userId: string,
  query: ListNotificationsQuery,
) {
  const { items, total } = await notificationRepository.findUserNotifications({
    userId,
    page: query.page,
    limit: query.limit,
    isRead: query.isRead,
    type: query.type,
    priority: query.priority,
  });

  const unreadCount =
    await notificationRepository.countUnreadNotifications(userId);

  const data = items.map((item) => ({
    recipientId: item.id,
    isRead: item.isRead,
    readAt: item.readAt,
    createdAt: item.notification.createdAt,
    notificationId: item.notification.id,
    title: item.notification.title,
    message: item.notification.message,
    type: item.notification.type,
    priority: item.notification.priority,
    examId: item.notification.examId,
    groupId: item.notification.groupId,
  }));

  const meta = buildPaginationMeta(
    {
      page: query.page,
      limit: query.limit,
      skip: (query.page - 1) * query.limit,
    },
    total,
  );

  return {
    data,
    pagination: meta,
    unreadCount,
  };
}

export async function markNotificationsRead(
  userId: string,
  input: MarkNotificationsReadInput,
) {
  const updatedCount = await notificationRepository.markRecipientsRead({
    userId,
    recipientIds: input.recipientIds,
    markAll: false,
  });

  const unreadCount =
    await notificationRepository.countUnreadNotifications(userId);

  return { updatedCount, unreadCount };
}

export async function markAllNotificationsRead(userId: string) {
  const updatedCount = await notificationRepository.markRecipientsRead({
    userId,
    markAll: true,
  });

  const unreadCount =
    await notificationRepository.countUnreadNotifications(userId);

  return { updatedCount, unreadCount };
}

async function resolveRecipientIds(
  input: CreateNotificationInput,
): Promise<string[]> {
  const recipientIds = new Set<string>(input.recipientIds ?? []);

  // Explicit recipients take precedence over scope-based resolution.
  if (input.recipientIds !== undefined) {
    return Array.from(recipientIds);
  }

  if (input.groupId) {
    const members = await notificationRepository.findGroupMemberUserIds([
      input.groupId,
    ]);
    members.forEach((id) => recipientIds.add(id));
  }

  if (input.groupIds && input.groupIds.length > 0) {
    const members = await notificationRepository.findGroupMemberUserIds(
      input.groupIds,
    );
    members.forEach((id) => recipientIds.add(id));
  }

  if (input.examId) {
    const enrolled = await notificationRepository.findExamEnrollmentUserIds(
      input.examId,
    );
    enrolled.forEach((id) => recipientIds.add(id));
  }

  return Array.from(recipientIds);
}

export async function createNotification(
  senderId: string,
  input: CreateNotificationInput,
) {
  await assertCanSendNotifications(senderId);

  const recipientIds = await resolveRecipientIds(input);

  if (recipientIds.length === 0) {
    throw new ValidationError("No recipients found for notification");
  }

  return notificationRepository.createNotificationRecord({
    senderId,
    title: input.title,
    message: input.message,
    type: input.type,
    priority: input.priority ?? NotificationPriority.NORMAL,
    examId: input.examId,
    groupId: input.groupId,
    recipientIds,
  });
}

export async function getSentNotifications(
  userId: string,
  query: ListSentNotificationsQuery,
) {
  await assertCanSendNotifications(userId);

  const skip = (query.page - 1) * query.limit;

  const { items, total } =
    await notificationRepository.findSentNotifications({
      senderId: userId,
      skip,
      limit: query.limit,
      type: query.type,
    });

  const meta = buildPaginationMeta(
    { page: query.page, limit: query.limit, skip },
    total,
  );

  const data = items.map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    priority: notification.priority,
    createdAt: notification.createdAt,
    examId: notification.examId,
    groupId: notification.groupId,
    recipientsCount: notification._count.recipients,
  }));

  return {
    data,
    pagination: meta,
  };
}
