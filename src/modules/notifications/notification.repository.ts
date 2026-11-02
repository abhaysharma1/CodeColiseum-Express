import prisma from "@/infrastructure/database/prisma";
import { runInTransaction } from "@/infrastructure/database/transactions";
import type {
  NotificationPriority,
  NotificationType,
} from "../../../generated/prisma/client";

export interface CreateNotificationRecordInput {
  senderId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  examId?: string;
  groupId?: string;
  recipientIds: string[];
}

export interface UserNotificationFilters {
  userId: string;
  page: number;
  limit: number;
  isRead?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
}

export async function createNotificationRecord(
  input: CreateNotificationRecordInput,
) {
  const { recipientIds, priority, ...notificationData } = input;

  return runInTransaction(async (tx) => {
    const notification = await tx.notification.create({
      data: {
        ...notificationData,
        priority,
      },
    });

    await tx.notificationRecipient.createMany({
      data: recipientIds.map((userId) => ({
        notificationId: notification.id,
        userId,
      })),
      skipDuplicates: true,
    });

    return {
      notification,
      recipientsCount: recipientIds.length,
    };
  });
}

export async function findUserNotifications(filters: UserNotificationFilters) {
  const skip = (filters.page - 1) * filters.limit;

  const where = {
    userId: filters.userId,
    ...(typeof filters.isRead === "boolean" ? { isRead: filters.isRead } : {}),
    ...(filters.type || filters.priority
      ? {
          notification: {
            ...(filters.type ? { type: filters.type } : {}),
            ...(filters.priority ? { priority: filters.priority } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where,
      include: { notification: true },
      orderBy: { notification: { createdAt: "desc" } },
      skip,
      take: filters.limit,
    }),
    prisma.notificationRecipient.count({ where }),
  ]);

  return { items, total };
}

export async function countUnreadNotifications(userId: string) {
  return prisma.notificationRecipient.count({
    where: { userId, isRead: false },
  });
}

export async function markRecipientsRead(params: {
  userId: string;
  recipientIds?: string[];
  markAll: boolean;
}) {
  const where = {
    userId: params.userId,
    isRead: false,
    ...(params.markAll ? {} : { id: { in: params.recipientIds ?? [] } }),
  };

  const result = await prisma.notificationRecipient.updateMany({
    where,
    data: { isRead: true, readAt: new Date() },
  });

  return result.count;
}

export async function findSentNotifications(params: {
  senderId: string;
  skip: number;
  limit: number;
  type?: NotificationType;
}) {
  const where = {
    senderId: params.senderId,
    ...(params.type ? { type: params.type } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: params.skip,
      take: params.limit,
      include: {
        _count: { select: { recipients: true } },
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, total };
}

export async function findGroupMemberUserIds(
  groupIds: string[],
): Promise<string[]> {
  const members = await prisma.groupMember.findMany({
    where: { groupId: { in: groupIds } },
    select: { userId: true },
  });

  return members.map((member) => member.userId);
}

export async function findExamEnrollmentUserIds(
  examId: string,
): Promise<string[]> {
  const enrollments = await prisma.examEnrollment.findMany({
    where: { examId },
    select: { userId: true },
  });

  return enrollments.map((enrollment) => enrollment.userId);
}
