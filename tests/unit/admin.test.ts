import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/admin/admin-moderation.repository", () => ({
  findProblemModerationState: vi.fn(),
  approveProblem: vi.fn(),
  rejectProblem: vi.fn(),
  findProblemsForModeration: vi.fn(),
}));

vi.mock("@/modules/analytics/analytics.repository", () => ({
  findOrganizationAnalytics: vi.fn(),
  findGroupMemberTotals: vi.fn(),
  averageExamResultScore: vi.fn(),
  countStudentStats: vi.fn(),
  findStudentStats: vi.fn(),
  findAttemptScoresBetween: vi.fn(),
  findTopStudentStats: vi.fn(),
}));

import * as moderationRepositoryModule from "@/modules/admin/admin-moderation.repository";
import * as analyticsRepositoryModule from "@/modules/analytics/analytics.repository";
import {
  approveProblem,
  rejectProblem,
} from "@/modules/admin/admin-moderation.service";
import {
  getOrgStudents,
  getTeacherChartData,
  getTopStudents,
} from "@/modules/analytics/analytics.service";
import { NotFoundError, ValidationError } from "@/shared/errors";

const moderationRepository = vi.mocked(moderationRepositoryModule);
const analyticsRepository = vi.mocked(analyticsRepositoryModule);

describe("admin moderation", () => {
  beforeEach(() => {
    moderationRepository.findProblemModerationState.mockReset();
    moderationRepository.approveProblem.mockReset();
    moderationRepository.rejectProblem.mockReset();
  });

  it("rejects moderation of non-teacher problems", async () => {
    moderationRepository.findProblemModerationState.mockResolvedValue({
      id: "problem-1",
      ownerType: "ADMIN",
    });

    await expect(
      approveProblem("problem-1", "admin-1"),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(moderationRepository.approveProblem).not.toHaveBeenCalled();
  });

  it("returns not found for a missing problem", async () => {
    moderationRepository.findProblemModerationState.mockResolvedValue(null);

    await expect(
      rejectProblem("problem-1", { reason: "Incomplete tests" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("approves teacher problems", async () => {
    moderationRepository.findProblemModerationState.mockResolvedValue({
      id: "problem-1",
      ownerType: "TEACHER",
    });
    moderationRepository.approveProblem.mockResolvedValue({} as never);

    await expect(
      approveProblem("problem-1", "admin-1"),
    ).resolves.toEqual({ message: "Problem approved successfully" });

    expect(moderationRepository.approveProblem).toHaveBeenCalledWith(
      "problem-1",
      "admin-1",
    );
  });
});

describe("organization analytics", () => {
  beforeEach(() => {
    analyticsRepository.countStudentStats.mockReset();
    analyticsRepository.findStudentStats.mockReset();
    analyticsRepository.findAttemptScoresBetween.mockReset();
    analyticsRepository.findTopStudentStats.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps paginated student statistics", async () => {
    analyticsRepository.countStudentStats.mockResolvedValue(1);
    analyticsRepository.findStudentStats.mockResolvedValue([
      {
        studentId: "student-1",
        student: { id: "student-1", name: "Ada", email: "ada@example.com" },
        group: { id: "group-1", name: "Alpha" },
        avgScore: 88,
        totalExams: 2,
        completionPercentage: 50,
        lastActive: new Date("2026-01-01"),
      },
    ] as never);

    const result = await getOrgStudents({
      page: 1,
      limit: 50,
      scoreMin: 0,
      scoreMax: 100,
    });

    expect(result.data).toEqual([
      {
        id: "student-1",
        name: "Ada",
        email: "ada@example.com",
        group: { id: "group-1", name: "Alpha" },
        avgScore: 88,
        totalExams: 2,
        completionPercentage: 50,
        lastActive: new Date("2026-01-01"),
      },
    ]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 1,
      pages: 1,
    });
  });

  it("buckets chart attempts in one repository query", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00"));

    analyticsRepository.findAttemptScoresBetween.mockResolvedValue([
      { startedAt: new Date("2026-01-08T09:00:00"), totalScore: 80 },
      { startedAt: new Date("2026-01-08T10:00:00"), totalScore: 60 },
      { startedAt: new Date("2026-01-09T09:00:00"), totalScore: 100 },
    ] as never);

    const chart = await getTeacherChartData("teacher-1", 7);

    expect(analyticsRepository.findAttemptScoresBetween).toHaveBeenCalledTimes(
      1,
    );
    expect(chart).toHaveLength(7);
    expect(chart.reduce((sum, day) => sum + day.studentCount, 0)).toBe(3);
    expect(chart.find((day) => day.studentCount === 2)?.avgScore).toBe(70);
  });

  it("ranks and rounds top students", async () => {
    analyticsRepository.findTopStudentStats.mockResolvedValue([
      {
        student: { id: "student-1", name: "Ada", email: "ada@example.com" },
        avgScore: 91.239,
        completionPercentage: 76.8,
      },
    ] as never);

    await expect(getTopStudents("teacher-1", 5)).resolves.toEqual([
      {
        id: "student-1",
        name: "Ada",
        email: "ada@example.com",
        rank: 1,
        avgScore: 91.24,
        completionPercentage: 76.8,
      },
    ]);
  });
});
