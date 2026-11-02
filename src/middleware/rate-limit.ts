import type { Request, RequestHandler, Response } from "express";
import {
  appConfig,
} from "@/config/app.config";
import {
  TooManyRequestsError,
} from "@/shared/errors";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}

const buckets = new Map<string, RateLimitBucket>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanupExpiredBuckets(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanup = now;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function defaultKeyGenerator(req: Request): string {
  return req.user?.id ?? req.ip ?? "unknown";
}

/**
 * Fixed-window in-memory limiter. It is intentionally dependency-free and
 * per-instance; a shared store can replace `buckets` when the API scales
 * horizontally without changing call sites.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  return (req: Request, res: Response, next) => {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const key = (options.keyGenerator ?? defaultKeyGenerator)(req) + ":" + req.baseUrl + req.path;
    const existing = buckets.get(key);

    const bucket =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + options.windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.resetAt - now) / 1000)),
      );
      next(new TooManyRequestsError());
      return;
    }

    next();
  };
}

export const globalRateLimit = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: appConfig.rateLimit.max,
});

export const authRateLimit = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: appConfig.rateLimit.authMax,
});

export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}
