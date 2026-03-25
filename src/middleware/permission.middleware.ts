import type { NextFunction, Request, Response } from "express";
import { hasPermission } from "@/permissions/permission.service";

type GroupIdResolver = (req: Request) => string | null | undefined;

export const requirePermission =
  (permission: string, getGroupId?: GroupIdResolver) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const groupId = getGroupId ? getGroupId(req) : undefined;
      const allowed = await hasPermission(req.user.id, permission, groupId);

      if (!allowed) {
        res.status(403).json({
          message: "Forbidden",
          permission
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };