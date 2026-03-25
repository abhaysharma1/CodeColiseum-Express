import { hasPermission } from "@/permissions/permission.service";
import { NextFunction, Request, Response } from "express";

export const checkPermission = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const permission =
      typeof req.query.permission === "string" ? req.query.permission : undefined;
    const groupId = typeof req.query.groupId === "string" ? req.query.groupId : undefined;

    if (!permission) {
      return res.status(400).json({ error: "permission is required" });
    }

    const allowed = await hasPermission(user.id, permission, groupId);

    return res.status(200).json({ allowed });
  } catch (error) {
    next(error);
  }
};
