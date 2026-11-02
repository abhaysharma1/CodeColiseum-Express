import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { UnauthorizedError } from "@/shared/errors";

const CRON_SECRET_HEADER = "x-cron-secret";

function hashesMatch(provided: string, expected: string): boolean {
  // Hash both values so `timingSafeEqual` receives buffers of equal length and
  // no length information is leaked through timing.
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(providedHash, expectedHash);
}

/**
 * Guards cron-triggered endpoints. A missing `CRON_SECRET` denies access
 * instead of allowing unauthenticated calls (the legacy implementation compared
 * `undefined !== undefined`).
 */
export function requireCronSecret(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    if (!env.CRON_SECRET) {
      logger.error("CRON_SECRET is not configured; rejecting internal request");
      throw new UnauthorizedError("Unauthorized");
    }

    const header = req.headers[CRON_SECRET_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !hashesMatch(provided, env.CRON_SECRET)) {
      throw new UnauthorizedError("Unauthorized");
    }

    next();
  } catch (error) {
    next(error);
  }
}
