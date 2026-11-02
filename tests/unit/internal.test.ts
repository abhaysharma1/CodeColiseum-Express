import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { requireCronSecret } from "@/middleware/cron-auth";
import { UnauthorizedError } from "@/shared/errors";
import { calculateAttemptScore } from "@/modules/internal/internal.service";

function buildRequest(secret?: string): Request {
  return {
    headers: secret ? { "x-cron-secret": secret } : {},
  } as unknown as Request;
}

describe("requireCronSecret", () => {
  it("allows a matching secret", () => {
    const next = vi.fn<NextFunction>();

    requireCronSecret(
      buildRequest(env.CRON_SECRET as string),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a missing secret", () => {
    const next = vi.fn<NextFunction>();

    requireCronSecret(buildRequest(), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a wrong secret of a different length", () => {
    const next = vi.fn<NextFunction>();

    requireCronSecret(buildRequest("wrong"), {} as Response, next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it("denies access when the secret is not configured", () => {
    const configured = env.CRON_SECRET;
    env.CRON_SECRET = undefined;
    const next = vi.fn<NextFunction>();

    try {
      requireCronSecret(buildRequest("anything"), {} as Response, next);
    } finally {
      env.CRON_SECRET = configured;
    }

    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });
});

describe("calculateAttemptScore", () => {
  it("averages per-problem percentages across all exam problems", () => {
    const score = calculateAttemptScore(
      [
        { passedTestcases: 10, totalTestcases: 10 },
        { passedTestcases: 5, totalTestcases: 10 },
      ],
      2,
    );

    expect(score).toBe(75);
  });

  it("counts unsolved problems as zero", () => {
    const score = calculateAttemptScore(
      [{ passedTestcases: 10, totalTestcases: 10 }],
      4,
    );

    expect(score).toBe(25);
  });

  it("returns zero when the exam has no problems", () => {
    expect(calculateAttemptScore([], 0)).toBe(0);
  });

  it("returns zero for zero-total test cases", () => {
    expect(
      calculateAttemptScore(
        [{ passedTestcases: 0, totalTestcases: 0 }],
        1,
      ),
    ).toBe(0);
  });

  it("rounds each problem before averaging", () => {
    const score = calculateAttemptScore(
      [
        { passedTestcases: 1, totalTestcases: 3 },
        { passedTestcases: 1, totalTestcases: 3 },
      ],
      2,
    );

    // 33.33 rounds to 33 per problem, average 33.
    expect(score).toBe(33);
  });
});
