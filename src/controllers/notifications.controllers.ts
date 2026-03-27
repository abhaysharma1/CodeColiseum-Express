import { Request, Response, NextFunction } from "express";
import prisma from "@/utils/prisma";
import {
  createNotification,
  getUnreadCount,
  getUserNotifications,
  markNotificationsRead,
} from "@/services/notifications.service";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import { NotificationPriority, NotificationType } from "../../generated/prisma/client";

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);

    let isRead: boolean | undefined;
    if (typeof req.query.isRead === "string") {
      if (req.query.isRead === "true") isRead = true;
      if (req.query.isRead === "false") isRead = false;
    }

    const typeParam = typeof req.query.type === "string" ? (req.query.type as NotificationType) : undefined;
    const priorityParam =
      typeof req.query.priority === "string" ? (req.query.priority as NotificationPriority) : undefined;

    const { items, total, pages, limit: usedLimit, page: usedPage } = await getUserNotifications({
      userId: user.id,
      page,
      limit,
      isRead,
      type: typeParam,
      priority: priorityParam,
    });

    const unreadCount = await getUnreadCount(user.id);

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

    return res.status(200).json({
      data,
      pagination: {
        page: usedPage,
        limit: usedLimit,
        total,
        pages,
      },
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

export const markNotificationsAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { recipientIds } = req.body as { recipientIds?: string[] };

    const { updatedCount } = await markNotificationsRead({
      userId: user.id,
      recipientIds,
      markAll: false,
    });

    const unreadCount = await getUnreadCount(user.id);

    return res.status(200).json({ updatedCount, unreadCount });
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { updatedCount } = await markNotificationsRead({
      userId: user.id,
      markAll: true,
    });

    const unreadCount = await getUnreadCount(user.id);

    return res.status(200).json({ updatedCount, unreadCount });
  } catch (error) {
    next(error);
  }
};

export const createNotificationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Only platform admins and org teachers can create notifications
    const allowedGlobalRoles = [
      GLOBAL_ROLE_IDS.PLATFORM_ADMIN,
      GLOBAL_ROLE_IDS.ORG_TEACHER,
    ];

    if (!user.globalRoleId || !allowedGlobalRoles.includes(user.globalRoleId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const {
      title,
      message,
      type,
      priority,
      examId,
      groupId,
      groupIds,
      recipientIds,
    } = req.body as {
      title?: string;
      message?: string;
      type?: NotificationType;
      priority?: NotificationPriority;
      examId?: string;
      groupId?: string;
      groupIds?: string[];
      recipientIds?: string[];
    };

    if (!title || !message || !type) {
      return res.status(400).json({ message: "title, message and type are required" });
    }

    let finalRecipientIds = new Set<string>();

    if (Array.isArray(recipientIds)) {
      recipientIds.forEach((id) => finalRecipientIds.add(id));
    }

    if (groupId && !recipientIds) {
      const members = await prisma.groupMember.findMany({
        where: { groupId },
        select: { userId: true },
      });
      members.forEach((m) => finalRecipientIds.add(m.userId));
    }

    if (Array.isArray(groupIds) && groupIds.length > 0 && !recipientIds) {
      const members = await prisma.groupMember.findMany({
        where: { groupId: { in: groupIds } },
        select: { userId: true },
      });
      members.forEach((m) => finalRecipientIds.add(m.userId));
    }

    if (examId && !recipientIds) {
      const enrollments = await prisma.examEnrollment.findMany({
        where: { examId },
        select: { userId: true },
      });
      enrollments.forEach((e) => finalRecipientIds.add(e.userId));
    }

    const recipientList = Array.from(finalRecipientIds);

    if (recipientList.length === 0) {
      return res.status(400).json({ message: "No recipients found for notification" });
    }

    const result = await createNotification({
      senderId: user.id,
      title,
      message,
      type,
      priority: priority ?? NotificationPriority.NORMAL,
      examId,
      groupId,
      recipientIds: recipientList,
    });

    return res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

export const getSentNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const allowedGlobalRoles = [
      GLOBAL_ROLE_IDS.PLATFORM_ADMIN,
      GLOBAL_ROLE_IDS.ORG_TEACHER,
    ];

    if (!user.globalRoleId || !allowedGlobalRoles.includes(user.globalRoleId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const typeParam = typeof req.query.type === "string" ? (req.query.type as NotificationType) : undefined;

    const where: any = { senderId: user.id };
    if (typeParam) {
      where.type = typeParam;
    }

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: {
            select: { recipients: true },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));

    const data = items.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      priority: n.priority,
      createdAt: n.createdAt,
      examId: n.examId,
      groupId: n.groupId,
      recipientsCount: n._count.recipients,
    }));

    return res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    });
  } catch (error) {
    next(error);
  }
};
