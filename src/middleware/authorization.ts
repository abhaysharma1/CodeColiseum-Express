import type { NextFunction, Request, RequestHandler, Response } from "express";
import { hasPermission } from "@/modules/permissions/permission.service";
import { ForbiddenError, UnauthorizedError } from "@/shared/errors";

export type GroupIdResolver = (req: Request) => string | null | undefined;

/**
 * Permission guard for module routes. `getGroupId` resolves the scope from the
 * validated request; when omitted the check is global.
 */
export function requirePermission(
  permission: string,
  getGroupId?: GroupIdResolver,
): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError("Unauthorized");
      }

      const groupId = getGroupId ? getGroupId(req) : undefined;
      const allowed = await hasPermission(req.user.id, permission, groupId);

      if (!allowed) {
        throw new ForbiddenError("Forbidden", { permission });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
