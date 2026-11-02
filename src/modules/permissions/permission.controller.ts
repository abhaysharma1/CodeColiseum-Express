import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import { getValidatedQuery } from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import type { CheckPermissionQuery } from "./permission.schema";
import {
  getUserPermissionSnapshot,
  hasPermission,
} from "./permission.service";

export const checkPermission = asyncHandler(
  async (req: Request, res: Response) => {
    const user = req.user;

    if (!user?.id) {
      throw new UnauthorizedError("Unauthorized");
    }

    const { permission, groupId } =
      getValidatedQuery<CheckPermissionQuery>(req);

    const allowed = await hasPermission(user.id, permission, groupId);

    return res.status(200).json({ allowed });
  },
);

export const getMyPermissions = asyncHandler(
  async (req: Request, res: Response) => {
    const user = req.user;

    if (!user?.id) {
      throw new UnauthorizedError("Unauthorized");
    }

    const snapshot = await getUserPermissionSnapshot(user.id);

    return res.status(200).json(snapshot);
  },
);
