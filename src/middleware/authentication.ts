import type { NextFunction, Request, RequestHandler, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/utils/auth";
import { ForbiddenError, UnauthorizedError } from "@/shared/errors";
import { asyncHandler } from "@/shared/http/async-handler";
import { findUserGlobalRole } from "@/modules/users/user.repository";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import type { AuthenticatedUser } from "@/shared/types/authenticated-user";

export type SessionUser = AuthenticatedUser;

/**
 * Reads the Better Auth session for the current request. Returns `null` for
 * anonymous requests instead of throwing so public endpoints can run optional
 * personalization.
 */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  return (session?.user as unknown as SessionUser | undefined) ?? null;
}

/**
 * Anonymous-friendly variant used by public endpoints that personalize their
 * response when a session exists.
 */
export async function getOptionalSessionUser(
  req: Request,
): Promise<SessionUser | null> {
  try {
    return await getSessionUser(req);
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const user = await getSessionUser(req);

    if (!user) {
      throw new UnauthorizedError("Unauthorized");
    }

    req.user = user;
    next();
  },
);

export function requireRole(
  roles: readonly string[],
  forbiddenMessage = "Forbidden",
): RequestHandler {
  return asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
      const user = await getSessionUser(req);

      if (!user) {
        throw new UnauthorizedError("Unauthorized");
      }

      const globalRoleId = await findUserGlobalRole(user.id);

      if (!globalRoleId || !roles.includes(globalRoleId)) {
        throw new ForbiddenError(forbiddenMessage);
      }

      req.user = user;
      next();
    },
  );
}

export const requireStudent = requireRole(
  [GLOBAL_ROLE_IDS.ORG_STUDENT],
  "Student access required",
);

export const requireTeacher = requireRole(
  [GLOBAL_ROLE_IDS.ORG_TEACHER, GLOBAL_ROLE_IDS.PLATFORM_ADMIN],
  "Forbidden",
);

export const requireAdmin = requireRole(
  [GLOBAL_ROLE_IDS.PLATFORM_ADMIN],
  "Admin access required",
);
