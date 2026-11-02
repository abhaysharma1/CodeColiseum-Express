import type { NextFunction, Request, Response } from "express";
import { requirePermission } from "@/middleware/authorization";

// Compatibility wrapper: legacy routes import `requirePermission` from here.
export { requirePermission };

export type GroupIdResolver = (req: Request) => string | null | undefined;

export type PermissionMiddleware = (
  permission: string,
  getGroupId?: GroupIdResolver,
) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
