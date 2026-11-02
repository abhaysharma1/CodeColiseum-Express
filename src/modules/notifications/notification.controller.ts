import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedBody,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as notificationService from "./notification.service";
import type {
  CreateNotificationInput,
  ListNotificationsQuery,
  ListSentNotificationsQuery,
  MarkNotificationsReadInput,
} from "./notification.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const getNotifications = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<ListNotificationsQuery>(req);

    const result = await notificationService.getUserNotifications(
      userId,
      query,
    );

    return res.status(200).json(result);
  },
);

export const markNotificationsAsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<MarkNotificationsReadInput>(req);

    const result = await notificationService.markNotificationsRead(
      userId,
      body,
    );

    return res.status(200).json(result);
  },
);

export const markAllNotificationsAsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    const result = await notificationService.markAllNotificationsRead(userId);

    return res.status(200).json(result);
  },
);

export const createNotificationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<CreateNotificationInput>(req);

    const result = await notificationService.createNotification(userId, body);

    return res.status(201).json({ data: result });
  },
);

export const getSentNotifications = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<ListSentNotificationsQuery>(req);

    const result = await notificationService.getSentNotifications(
      userId,
      query,
    );

    return res.status(200).json(result);
  },
);
