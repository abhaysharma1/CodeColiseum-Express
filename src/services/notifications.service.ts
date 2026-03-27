import prisma from "@/utils/prisma";
import { NotificationPriority, NotificationType } from "../../generated/prisma/client";

export type CreateNotificationInput = {
  senderId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  examId?: string;
  groupId?: string;
  recipientIds: string[];
};

export async function createNotification(input: CreateNotificationInput) {
  const { recipientIds, priority, ...notificationData } = input;

  if (!recipientIds || recipientIds.length === 0) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const notification = await tx.notification.create({
      data: {
        ...notificationData,
        priority: priority ?? NotificationPriority.NORMAL,
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

export type GetUserNotificationsParams = {
  userId: string;
  page: number;
  limit: number;
  isRead?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
};

export async function getUserNotifications(params: GetUserNotificationsParams) {
  const { userId, page, limit, isRead, type, priority } = params;

  const safePage = Math.max(1, page || 1);
  const safeLimit = Math.min(50, limit || 20);
  const skip = (safePage - 1) * safeLimit;

  const where: any = {
    userId,
  };

  if (typeof isRead === "boolean") {
    where.isRead = isRead;
  }

  if (type || priority) {
    where.notification = {};
    if (type) {
      where.notification.type = type;
    }
    if (priority) {
      where.notification.priority = priority;
    }
  }

  const [items, total] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where,
      include: {
        notification: true,
      },
      orderBy: {
        notification: {
          createdAt: "desc",
        },
      },
      skip,
      take: safeLimit,
    }),
    prisma.notificationRecipient.count({ where }),
  ]);

  const pages = Math.ceil(total / safeLimit) || 1;

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages,
  };
}

export async function getUnreadCount(userId: string) {
  const count = await prisma.notificationRecipient.count({
    where: {
      userId,
      isRead: false,
    },
  });

  return count;
}

export type MarkNotificationsReadParams = {
  userId: string;
  recipientIds?: string[];
  markAll?: boolean;
};

export async function markNotificationsRead(params: MarkNotificationsReadParams) {
  const { userId, recipientIds, markAll } = params;

  const where: any = {
    userId,
    isRead: false,
  };

  if (!markAll) {
    if (!recipientIds || recipientIds.length === 0) {
      return { updatedCount: 0 };
    }
    where.id = {
      in: recipientIds,
    };
  }

  const result = await prisma.notificationRecipient.updateMany({
    where,
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return { updatedCount: result.count };
}
