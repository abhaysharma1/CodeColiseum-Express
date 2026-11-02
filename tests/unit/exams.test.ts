import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/exams/exam.repository", () => ({
  findAttemptById: vi.fn(),
  findAttemptSubmissions: vi.fn(),
}));

import * as examRepository from "@/modules/exams/exam.repository";
import {
  calculateSubmittedExamScore,
  getSubmissions,
} from "@/modules/exams/exam.service";
import { ForbiddenError } from "@/shared/errors";

const repository = vi.mocked(examRepository);

describe("calculateSubmittedExamScore", () => {
  it("keeps the highest score per problem", () => {
    const score = calculateSubmittedExamScore(
      [
        { problemId: "p1", passedTestcases: 2, totalTestcases: 10 },
        { problemId: "p1", passedTestcases: 8, totalTestcases: 10 },
      ],
      2,
    );

    expect(score).toBe(40);
  });

  it("counts missing problems as zero", () => {
    const score = calculateSubmittedExamScore(
      [{ problemId: "p1", passedTestcases: 10, totalTestcases: 10 }],
      4,
    );

    expect(score).toBe(25);
  });

  it("returns zero for an empty exam", () => {
    expect(calculateSubmittedExamScore([], 0)).toBe(0);
  });
});

describe("exam submission history authorization", () => {
  beforeEach(() => {
    repository.findAttemptById.mockReset();
    repository.findAttemptSubmissions.mockReset();
  });

  it("rejects reading another student's attempt", async () => {
    repository.findAttemptById.mockResolvedValue({
      id: "attempt-1",
      studentId: "student-2",
    });

    await expect(
      getSubmissions({
        userId: "student-1",
        attemptId: "attempt-1",
        problemId: "problem-1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(repository.findAttemptSubmissions).not.toHaveBeenCalled();
  });

  it("returns submissions for the owning student", async () => {
    repository.findAttemptById.mockResolvedValue({
      id: "attempt-1",
      studentId: "student-1",
    });
    repository.findAttemptSubmissions.mockResolvedValue([]);

    await expect(
      getSubmissions({
        userId: "student-1",
        attemptId: "attempt-1",
        problemId: "problem-1",
      }),
    ).resolves.toEqual({ submissions: [] });
  });
});
