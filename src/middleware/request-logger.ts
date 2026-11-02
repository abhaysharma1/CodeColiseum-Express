import type { NextFunction, Request, Response } from "express";
import { logger } from "@/config/logger";

/**
 * Structured access log. Replaces `morgan("dev")` so every line carries the
 * request id and can be correlated with error logs.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.info("request completed", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
    });
  });

  next();
}
