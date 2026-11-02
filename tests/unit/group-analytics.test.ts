import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/analytics/group-analytics.repository", () => ({
  findGroupById: vi.fn(),
  findGroupOverallStats: vi.fn(),
  findStudentOverallStats: vi.fn(),
  countStudentStats: vi.fn(),
  findStudentStatsPage: vi.fn(),
  findStudentScores: vi.fn(),
  findWeakestProblemStats: vi.fn(),
  findHardestProblemStat: vi.fn(),
  findProblemSummaries: vi.fn(),
  findGroupStudentStatSummary: vi.fn(),
  findScoreDistributionData: vi.fn(),
  findCompletionDistributionData: vi.fn(),
  findGroupTrendResults: vi.fn(),
  findProblemTimeStats: vi.fn(),
  findProblemDetailsByIds: vi.fn(),
  findAllGroupProblemStats: vi.fn(),
  findAllExamsForGroup: vi.fn(),
  findGroupProblemStats: vi.fn(),
}));

vi.mock("@/modules/users/user.repository", () => ({
  findUserGlobalRole: vi.fn(),
}));

vi.mock("@/modules/permissions/permission.service", () => ({
  getPermissionLookupKeys: vi.fn(() => ["analytics:view"]),
  hasGroupPermission: vi.fn(),
}));

import * as repositoryModule from "@/modules/analytics/group-analytics.repository";
import * as userRepositoryModule from "@/modules/users/user.repository";
import * as permissionServiceModule from "@/modules/permissions/permission.service";
import {
  buildAnalyticsCsv,
  getAnalyticsCharts,
  getAnalyticsOverview,
  getAnalyticsStudents,
  getGroupOverallStats,
} from "@/modules/analytics/group-analytics.service";
import { ForbiddenError, NotFoundError } from "@/shared/errors";

const repository = vi.mocked(repositoryModule);
const users = vi.mocked(userRepositoryModule);
const permissions = vi.mocked(permissionServiceModule);

const group = { id: "group-1", name: "Alpha", creatorId: "teacher-1" };

function allowAccess() {
  repository.findGroupById.mockResolvedValue(group as never);
  users.findUserGlobalRole.mockResolvedValue("role_org_teacher");
  permissions.hasGroupPermission.mockResolvedValue(true);
}

describe("group analytics access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not found for a missing group", async () => {
    repository.findGroupById.mockResolvedValue(null);

    await expect(
      getGroupOverallStats("teacher-1", "group-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a teacher without group analytics permission", async () => {
    repository.findGroupById.mockResolvedValue(group as never);
    users.findUserGlobalRole.mockResolvedValue("role_org_teacher");
    permissions.hasGroupPermission.mockResolvedValue(false);

    await expect(
      getGroupOverallStats("teacher-2", "group-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("group analytics payloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowAccess();
  });

  it("returns the stored group stats or null", async () => {
    repository.findGroupOverallStats.mockResolvedValue({
      groupId: "group-1",
      totalStudents: 10,
    } as never);

    await expect(
      getGroupOverallStats("teacher-1", "group-1"),
    ).resolves.toEqual({ groupId: "group-1", totalStudents: 10 });

    repository.findGroupOverallStats.mockResolvedValue(null);
    await expect(
      getGroupOverallStats("teacher-1", "group-1"),
    ).resolves.toBeNull();
  });

  it("maps ranked students and pagination", async () => {
    repository.countStudentStats.mockResolvedValue(1);
    repository.findStudentScores.mockResolvedValue([
      { studentId: "student-1", avgScore: 90 },
    ] as never);
    repository.findStudentStatsPage.mockResolvedValue([
      {
        studentId: "student-1",
        student: { id: "student-1", name: "Ada", email: "ada@example.com" },
        avgScore: 90,
        totalAttempts: 3,
        avgAttemptsPerProblem: 1.5,
        completionPercentage: 80,
        weakTopics: [],
        strongTopics: [],
        scoreTrend: [],
        lastActive: null,
        avgTimePerProblem: 5,
      },
    ] as never);

    const result = await getAnalyticsStudents("teacher-1", {
      groupId: "group-1",
      page: 1,
      limit: 50,
      scoreMin: 0,
      scoreMax: 100,
      completionMin: 0,
      completionMax: 100,
      completionStatus: "all",
      sortBy: "avgScore",
      sortOrder: "desc",
    });

    expect(result.data[0]).toMatchObject({ id: "student-1", rank: 1 });
    expect(result.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 1,
      pages: 1,
    });
  });

  it("computes overview metrics in one pass", async () => {
    repository.findGroupOverallStats.mockResolvedValue({
      totalStudents: 2,
      avgScoreAllExams: 70,
      completionRate: 0.5,
      overallPassRate: 0.5,
    } as never);
    repository.findGroupStudentStatSummary.mockResolvedValue([
      { avgScore: 70, avgAttemptsPerProblem: 2, completionPercentage: 100, lastActive: new Date() },
      { avgScore: 60, avgAttemptsPerProblem: 4, completionPercentage: 50, lastActive: null },
    ] as never);
    repository.findWeakestProblemStats.mockResolvedValue([
      { problemId: "problem-1", successRate: 10, failureRate: 90 },
    ] as never);
    repository.findHardestProblemStat.mockResolvedValue({
      problemId: "problem-1",
    } as never);
    repository.findProblemSummaries.mockResolvedValue([
      { id: "problem-1", title: "Two Sum", number: 1 },
    ] as never);

    const result = await getAnalyticsOverview("teacher-1", "group-1");

    expect(result.totalStudents).toBe(2);
    expect(result.activeStudents).toBe(1);
    expect(result.avgAttempts).toBe(3);
    expect(result.weakestProblem).toEqual({
      id: "problem-1",
      title: "Two Sum",
      number: 1,
    });
  });

  it("builds score/completion distributions and a single-query time chart", async () => {
    repository.findScoreDistributionData.mockResolvedValue([
      { avgScore: 10 },
      { avgScore: 50 },
      { avgScore: 90 },
    ] as never);
    repository.findCompletionDistributionData.mockResolvedValue([
      { completionPercentage: 0 },
      { completionPercentage: 50 },
      { completionPercentage: 100 },
    ] as never);
    repository.findGroupTrendResults.mockResolvedValue([
      { createdAt: new Date("2026-01-01T10:00:00Z"), score: 80 },
      { createdAt: new Date("2026-01-01T11:00:00Z"), score: 60 },
    ] as never);
    repository.findProblemTimeStats.mockResolvedValue([
      { problemId: "problem-1", avgTime: 12 },
    ] as never);
    repository.findProblemDetailsByIds.mockResolvedValue([
      { id: "problem-1", title: "Two Sum", number: 1, difficulty: "EASY" },
    ] as never);

    const charts = await getAnalyticsCharts("teacher-1", {
      groupId: "group-1",
      type: "all",
    });

    expect(charts.scoreDistribution).toEqual({
      "0-20": 1,
      "20-40": 0,
      "40-60": 1,
      "60-80": 0,
      "80-100": 1,
    });
    expect(charts.completionDistribution).toEqual({
      notStarted: 1,
      inProgress: 1,
      completed: 1,
    });
    expect(charts.timeSpentByProblem).toEqual([
      { problemNumber: 1, problemTitle: "Two Sum", avgTime: 12 },
    ]);
    expect(repository.findProblemDetailsByIds).toHaveBeenCalledTimes(1);
  });

  it("builds CSV sections", () => {
    const csv = buildAnalyticsCsv({
      group: group as never,
      groupStats: null,
      students: [
        {
          student: { id: "s1", name: "Ada", email: "ada@example.com" },
          avgScore: 90,
          totalAttempts: 2,
          avgAttemptsPerProblem: 1,
          completionPercentage: 100,
          lastActive: null,
        },
      ] as never,
      problems: [],
      exams: [],
    });

    expect(csv).toContain("=== Students ===");
    expect(csv).toContain("Ada,ada@example.com,90.0,2,1.0,100.0,");
    expect(csv).toContain("=== Problems ===");
    expect(csv).toContain("=== Exams ===");
  });
});
