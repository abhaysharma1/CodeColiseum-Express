import type { Prisma } from "../../../generated/prisma/client";
import { ForbiddenError, NotFoundError } from "@/shared/errors";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import { PERMISSIONS } from "@/permissions/permission.constants";
import {
  getPermissionLookupKeys,
  hasGroupPermission,
} from "@/modules/permissions/permission.service";
import { findUserGlobalRole } from "@/modules/users/user.repository";
import * as repository from "./group-analytics.repository";
import type {
  AnalyticsExamsQuery,
  AnalyticsProblemStudentsQuery,
  AnalyticsProblemsQuery,
  AnalyticsStudentsQuery,
  ChartsQuery,
  GroupProblemsQuery,
} from "./group-analytics.schema";

async function canViewGroupAnalytics(
  userId: string,
  groupId: string,
  creatorId: string,
): Promise<boolean> {
  if (creatorId === userId) {
    return true;
  }

  const globalRoleId = await findUserGlobalRole(userId);
  if (globalRoleId === GLOBAL_ROLE_IDS.PLATFORM_ADMIN) {
    return true;
  }

  const permissionKeys = getPermissionLookupKeys(PERMISSIONS.ANALYTICS_VIEW);
  return hasGroupPermission(userId, groupId, permissionKeys);
}

async function requireGroupAccess(userId: string, groupId: string) {
  const group = await repository.findGroupById(groupId);

  if (!group) {
    throw new NotFoundError("Group not found");
  }

  if (!(await canViewGroupAnalytics(userId, groupId, group.creatorId))) {
    throw new ForbiddenError("Not authorized");
  }

  return group;
}

function studentOrderBy(
  sortBy: AnalyticsStudentsQuery["sortBy"],
  sortOrder: "asc" | "desc",
): Prisma.StudentOverallStatsOrderByWithRelationInput {
  switch (sortBy) {
    case "attempts":
      return { totalAttempts: sortOrder };
    case "lastActive":
      return { lastActive: sortOrder };
    case "completionPercentage":
      return { completionPercentage: sortOrder };
    case "name":
      return { student: { name: sortOrder } };
    default:
      return { avgScore: sortOrder };
  }
}

function problemOrderBy(
  sortBy: AnalyticsProblemsQuery["sortBy"],
  sortOrder: "asc" | "desc",
): Prisma.GroupProblemStatsOrderByWithRelationInput {
  switch (sortBy) {
    case "successRate":
      return { successRate: sortOrder };
    case "failureRate":
      return { failureRate: sortOrder };
    case "avgTime":
      return { avgTime: sortOrder };
    case "acceptedCount":
      return { acceptedCount: sortOrder };
    case "totalAttempts":
      return { totalAttempts: sortOrder };
    case "avgRuntime":
      return { avgRuntime: sortOrder };
    default:
      return { attemptedCount: sortOrder };
  }
}

function examOrderBy(
  sortBy: AnalyticsExamsQuery["sortBy"],
  sortOrder: "asc" | "desc",
): Prisma.ExamOrderByWithRelationInput {
  switch (sortBy) {
    case "startDate":
      return { startDate: sortOrder };
    case "title":
      return { title: sortOrder };
    case "durationMin":
      return { durationMin: sortOrder };
    default:
      return { endDate: sortOrder };
  }
}

export async function getGroupOverallStats(userId: string, groupId: string) {
  await requireGroupAccess(userId, groupId);
  return (await repository.findGroupOverallStats(groupId)) ?? null;
}

export async function getGroupProblemStats(
  userId: string,
  query: GroupProblemsQuery,
) {
  await requireGroupAccess(userId, query.groupId);

  return repository.findGroupProblemStats({
    groupId: query.groupId,
    searchValue: query.searchValue,
    take: query.take,
    skip: query.skip,
  });
}

export async function getStudentOverallStats(
  userId: string,
  groupId: string,
) {
  await requireGroupAccess(userId, groupId);
  return repository.findStudentOverallStats(groupId);
}

export async function getStudentProblemStats(
  userId: string,
  query: { groupId: string; studentId: string },
) {
  await requireGroupAccess(userId, query.groupId);
  return repository.findStudentProblemStats(query);
}

export async function getAnalyticsStudents(
  userId: string,
  query: AnalyticsStudentsQuery,
) {
  await requireGroupAccess(userId, query.groupId);

  const skip = (query.page - 1) * query.limit;
  const where: Prisma.StudentOverallStatsWhereInput = { groupId: query.groupId };

  if (query.search) {
    where.student = {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    };
  }

  if (query.scoreMin !== 0 || query.scoreMax !== 100) {
    where.avgScore = { gte: query.scoreMin, lte: query.scoreMax };
  }

  if (query.completionMin !== 0 || query.completionMax !== 100) {
    where.completionPercentage = {
      gte: query.completionMin,
      lte: query.completionMax,
    };
  }

  if (query.completionStatus === "completed") {
    where.completionPercentage = { gte: 100 };
  } else if (query.completionStatus === "incomplete") {
    where.completionPercentage = { lt: 100 };
  }

  if (query.weakTopic) {
    where.weakTopics = { array_contains: query.weakTopic };
  }

  const orderBy = studentOrderBy(query.sortBy, query.sortOrder);

  const [total, students, scores] = await Promise.all([
    repository.countStudentStats(where),
    repository.findStudentStatsPage({
      where,
      orderBy,
      skip,
      take: query.limit,
    }),
    repository.findStudentScores(query.groupId),
  ]);

  const rankMap = new Map(
    scores.map((student, index) => [student.studentId, index + 1]),
  );

  const data = students.map((student) => ({
    id: student.studentId,
    name: student.student.name,
    email: student.student.email,
    rank: rankMap.get(student.studentId) ?? 0,
    avgScore: student.avgScore,
    totalAttempts: student.totalAttempts,
    avgAttemptsPerProblem: student.avgAttemptsPerProblem,
    completionPercentage: student.completionPercentage,
    weakTopics: student.weakTopics,
    strongTopics: student.strongTopics,
    scoreTrend: student.scoreTrend,
    lastActive: student.lastActive,
    avgTimePerProblem: student.avgTimePerProblem,
  }));

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function getStudentDetailedAnalytics(params: {
  userId: string;
  groupId: string;
  studentId: string;
}) {
  await requireGroupAccess(params.userId, params.groupId);

  const [problemStats, submissions, examResults] = await Promise.all([
    repository.findStudentProblemStatsDetailed({
      groupId: params.groupId,
      studentId: params.studentId,
    }),
    repository.findRecentStudentSubmissions(params.studentId),
    repository.findStudentExamResults(params.studentId),
  ]);

  return {
    problemPerformance: problemStats.map((stat) => ({
      problemId: stat.problemId,
      problemNumber: stat.problem.number,
      problemTitle: stat.problem.title,
      difficulty: stat.problem.difficulty,
      attempts: stat.attempts,
      solved: stat.solved,
      isWeak: stat.isWeak,
      successRate: stat.successRate,
      avgTime: stat.avgTime,
    })),
    recentSubmissions: submissions.map((submission) => ({
      id: submission.id,
      problem: submission.problem?.title,
      status: submission.status,
      score:
        submission.totalTestcases > 0
          ? (submission.passedTestcases / submission.totalTestcases) * 100
          : 0,
      createdAt: submission.createdAt,
    })),
    examHistory: examResults.map((result) => ({
      examId: result.examId,
      examTitle: result.exam.title,
      score: result.score,
      createdAt: result.createdAt,
    })),
  };
}

export async function getAnalyticsOverview(
  userId: string,
  groupId: string,
) {
  await requireGroupAccess(userId, groupId);

  const [groupStats, studentStats, weakestStats, hardestStat] =
    await Promise.all([
      repository.findGroupOverallStats(groupId),
      repository.findGroupStudentStatSummary(groupId),
      repository.findWeakestProblemStats(groupId),
      repository.findHardestProblemStat(groupId),
    ]);

  const weakest = weakestStats[0];

  const problemIds = [
    weakest?.problemId,
    hardestStat?.problemId,
  ].filter((id): id is string => Boolean(id));

  const problems = await repository.findProblemSummaries(problemIds);
  const problemMap = new Map(problems.map((problem) => [problem.id, problem]));

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activeStudents = studentStats.filter(
    (student) => student.lastActive && new Date(student.lastActive) > last24h,
  ).length;

  const avgAttempts =
    studentStats.length > 0
      ? studentStats.reduce(
          (sum, student) => sum + (student.avgAttemptsPerProblem || 0),
          0,
        ) / studentStats.length
      : 0;

  return {
    totalStudents: groupStats?.totalStudents || 0,
    activeStudents,
    avgScore: groupStats?.avgScoreAllExams || 0,
    completionRate: groupStats?.completionRate || 0,
    overallPassRate: groupStats?.overallPassRate || 0,
    weakestProblem: weakest ? problemMap.get(weakest.problemId) ?? null : null,
    hardestProblem: hardestStat
      ? problemMap.get(hardestStat.problemId) ?? null
      : null,
    avgAttempts,
  };
}

export async function getAnalyticsCharts(
  userId: string,
  query: ChartsQuery,
) {
  await requireGroupAccess(userId, query.groupId);

  const response: {
    scoreDistribution?: Record<string, number>;
    performanceTrend?: { date: string; avgScore: number; count: number }[];
    completionDistribution?: {
      notStarted: number;
      inProgress: number;
      completed: number;
    };
    timeSpentByProblem?: {
      problemNumber?: number;
      problemTitle?: string;
      avgTime: number;
    }[];
  } = {};

  const chartType = query.type;

  if (chartType === "all" || chartType === "distribution") {
    const students = await repository.findScoreDistributionData(query.groupId);
    const distribution: Record<string, number> = {
      "0-20": 0,
      "20-40": 0,
      "40-60": 0,
      "60-80": 0,
      "80-100": 0,
    };

    students.forEach((student) => {
      if (student.avgScore < 20) distribution["0-20"] += 1;
      else if (student.avgScore < 40) distribution["20-40"] += 1;
      else if (student.avgScore < 60) distribution["40-60"] += 1;
      else if (student.avgScore < 80) distribution["60-80"] += 1;
      else distribution["80-100"] += 1;
    });

    response.scoreDistribution = distribution;
  }

  if (chartType === "all" || chartType === "trend") {
    const examResults = await repository.findGroupTrendResults(
      query.groupId,
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    const trendByDay: Record<string, number[]> = {};

    examResults.forEach((result) => {
      const day = result.createdAt.toISOString().split("T")[0];
      if (!trendByDay[day]) trendByDay[day] = [];
      trendByDay[day].push(result.score);
    });

    response.performanceTrend = Object.entries(trendByDay).map(
      ([date, scores]) => ({
        date,
        avgScore: Math.round(
          scores.reduce((sum, score) => sum + score, 0) / scores.length,
        ),
        count: scores.length,
      }),
    );
  }

  if (chartType === "all" || chartType === "completion") {
    const students = await repository.findCompletionDistributionData(
      query.groupId,
    );

    response.completionDistribution = {
      notStarted: students.filter(
        (student) => student.completionPercentage === 0,
      ).length,
      inProgress: students.filter(
        (student) =>
          student.completionPercentage > 0 &&
          student.completionPercentage < 100,
      ).length,
      completed: students.filter(
        (student) => student.completionPercentage === 100,
      ).length,
    };
  }

  if (chartType === "all" || chartType === "time") {
    const problemStats = await repository.findProblemTimeStats(query.groupId);
    const problems = await repository.findProblemDetailsByIds(
      problemStats.map((stats) => stats.problemId),
    );
    const problemMap = new Map(
      problems.map((problem) => [problem.id, problem]),
    );

    response.timeSpentByProblem = problemStats.map((stats) => ({
      problemNumber: problemMap.get(stats.problemId)?.number,
      problemTitle: problemMap.get(stats.problemId)?.title,
      avgTime: stats.avgTime,
    }));
  }

  return response;
}

export async function getAnalyticsProblems(
  userId: string,
  query: AnalyticsProblemsQuery,
) {
  await requireGroupAccess(userId, query.groupId);

  const skip = (query.page - 1) * query.limit;

  const where: Prisma.GroupProblemStatsWhereInput = {
    groupId: query.groupId,
    ...(query.difficultyTier !== "all"
      ? { difficultyTier: query.difficultyTier }
      : {}),
    ...(query.search
      ? {
          problem: {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    repository.countGroupProblemStats(where),
    repository.findGroupProblemStatsPage({
      where,
      orderBy: problemOrderBy(query.sortBy, query.sortOrder),
      skip,
      take: query.limit,
    }),
  ]);

  const data = rows.map((row) => ({
    problemId: row.problemId,
    problemNumber: row.problem.number,
    problemTitle: row.problem.title,
    difficulty: row.problem.difficulty,
    difficultyTier: row.difficultyTier,
    successRate: row.successRate,
    failureRate: row.failureRate,
    totalStudents: row.totalStudents,
    attemptedCount: row.attemptedCount,
    acceptedCount: row.acceptedCount,
    totalAttempts: row.totalAttempts,
    avgRuntime: row.avgRuntime,
    avgMemory: row.avgMemory,
    avgTime: row.avgTime,
    updatedAt: row.updatedAt,
  }));

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function getAnalyticsProblemDetails(params: {
  userId: string;
  groupId: string;
  problemId: string;
}) {
  await requireGroupAccess(params.userId, params.groupId);

  const stats = await repository.findGroupProblemStat(params);

  if (!stats) {
    throw new NotFoundError("Problem analytics not found");
  }

  return {
    problem: stats.problem,
    stats: {
      difficultyTier: stats.difficultyTier,
      successRate: stats.successRate,
      failureRate: stats.failureRate,
      totalStudents: stats.totalStudents,
      attemptedCount: stats.attemptedCount,
      acceptedCount: stats.acceptedCount,
      totalAttempts: stats.totalAttempts,
      avgRuntime: stats.avgRuntime,
      avgMemory: stats.avgMemory,
      avgTime: stats.avgTime,
      updatedAt: stats.updatedAt,
    },
  };
}

export async function getAnalyticsProblemStudents(params: {
  userId: string;
  problemId: string;
  query: AnalyticsProblemStudentsQuery;
}) {
  await requireGroupAccess(params.userId, params.query.groupId);

  const skip = (params.query.page - 1) * params.query.limit;
  const where: Prisma.StudentProblemStatsWhereInput = {
    groupId: params.query.groupId,
    problemId: params.problemId,
  };

  if (params.query.solvedStatus === "solved") where.solved = true;
  else if (params.query.solvedStatus === "unsolved") where.solved = false;
  else if (params.query.solvedStatus === "weak") where.isWeak = true;

  if (params.query.search) {
    where.student = {
      OR: [
        { name: { contains: params.query.search, mode: "insensitive" } },
        { email: { contains: params.query.search, mode: "insensitive" } },
      ],
    };
  }

  const [total, rows] = await Promise.all([
    repository.countStudentProblemStats(where),
    repository.findStudentProblemStatsPage({
      where,
      skip,
      take: params.query.limit,
    }),
  ]);

  const data = rows.map((row) => ({
    studentId: row.studentId,
    name: row.student.name,
    email: row.student.email,
    attempts: row.attempts,
    solved: row.solved,
    isWeak: row.isWeak,
    successRate: row.successRate,
    avgTime: row.avgTime,
    lastAttemptAt: row.lastAttemptAt,
  }));

  return {
    data,
    pagination: {
      page: params.query.page,
      limit: params.query.limit,
      total,
      pages: Math.ceil(total / params.query.limit),
    },
  };
}

export async function getAnalyticsExams(
  userId: string,
  query: AnalyticsExamsQuery,
) {
  await requireGroupAccess(userId, query.groupId);

  const skip = (query.page - 1) * query.limit;
  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
  const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

  const where: Prisma.ExamWhereInput = {
    examGroups: { some: { groupId: query.groupId } },
    ...(query.search
      ? { title: { contains: query.search, mode: "insensitive" } }
      : {}),
    ...(query.status !== "all" ? { status: query.status } : {}),
    ...(dateFrom || dateTo
      ? {
          endDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };

  const [total, exams] = await Promise.all([
    repository.countExams(where),
    repository.findExamsForAnalytics({
      where,
      orderBy: examOrderBy(query.sortBy, query.sortOrder),
      skip,
      take: query.limit,
      groupId: query.groupId,
    }),
  ]);

  const data = exams.map((exam) => {
    const analytics = exam.groupExamAnalytics[0];

    return {
      examId: exam.id,
      examTitle: exam.title,
      status: exam.status,
      startDate: exam.startDate,
      endDate: exam.endDate,
      durationMin: exam.durationMin,
      analytics: analytics
        ? {
            totalEnrolled: analytics.totalEnrolled,
            totalAttempted: analytics.totalAttempted,
            totalCompleted: analytics.totalCompleted,
            completionRate: analytics.completionRate,
            avgScore: analytics.avgScore,
            highestScore: analytics.highestScore,
            lowestScore: analytics.lowestScore,
            medianScore: analytics.medianScore,
            scoreDistribution: analytics.scoreDistribution,
            avgTimeToComplete: analytics.avgTimeToComplete,
            avgAttempts: analytics.avgAttempts,
            totalSubmissions: analytics.totalSubmissions,
            acceptedCount: analytics.acceptedCount,
            partialCount: analytics.partialCount,
            failedCount: analytics.failedCount,
            updatedAt: analytics.updatedAt,
          }
        : null,
    };
  });

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function getAnalyticsExamDetails(params: {
  userId: string;
  groupId: string;
  examId: string;
}) {
  await requireGroupAccess(params.userId, params.groupId);

  const analytics = await repository.findGroupExamAnalytics(params);

  if (!analytics) {
    throw new NotFoundError("Exam analytics not found");
  }

  const difficulties = Array.isArray(analytics.problemDifficulties)
    ? (analytics.problemDifficulties as unknown[])
    : [];

  const problemIds = difficulties
    .map((entry) =>
      entry && typeof entry === "object"
        ? String((entry as { problemId?: unknown }).problemId ?? "")
        : "",
    )
    .filter(Boolean);

  const problems = await repository.findProblemDetailsByIds(problemIds);
  const problemMap = new Map(problems.map((problem) => [problem.id, problem]));

  const problemDifficulties = difficulties.map((entry) => {
    const record = entry as {
      problemId?: unknown;
      avgScore?: unknown;
      failureRate?: unknown;
    };
    const problemId = String(record.problemId ?? "");
    const problem = problemMap.get(problemId);

    return {
      problemId,
      problemNumber: problem?.number,
      problemTitle: problem?.title,
      difficulty: problem?.difficulty,
      avgScore: Number(record.avgScore || 0),
      failureRate: Number(record.failureRate || 0),
    };
  });

  return {
    exam: analytics.exam,
    analytics: {
      totalEnrolled: analytics.totalEnrolled,
      totalAttempted: analytics.totalAttempted,
      totalCompleted: analytics.totalCompleted,
      completionRate: analytics.completionRate,
      avgScore: analytics.avgScore,
      highestScore: analytics.highestScore,
      lowestScore: analytics.lowestScore,
      medianScore: analytics.medianScore,
      scoreDistribution: analytics.scoreDistribution,
      avgTimeToComplete: analytics.avgTimeToComplete,
      avgAttempts: analytics.avgAttempts,
      totalSubmissions: analytics.totalSubmissions,
      acceptedCount: analytics.acceptedCount,
      partialCount: analytics.partialCount,
      failedCount: analytics.failedCount,
      updatedAt: analytics.updatedAt,
    },
    problemDifficulties,
  };
}

export async function getAnalyticsExportData(
  userId: string,
  groupId: string,
) {
  const group = await requireGroupAccess(userId, groupId);

  const [groupStats, students, problems, exams] = await Promise.all([
    repository.findGroupOverallStats(groupId),
    repository.findStudentOverallStats(groupId),
    repository.findAllGroupProblemStats(groupId),
    repository.findAllExamsForGroup(groupId),
  ]);

  return { group, groupStats, students, problems, exams };
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  return text.includes(",") || text.includes('"') || text.includes("\n")
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function buildAnalyticsCsv(
  data: Awaited<ReturnType<typeof getAnalyticsExportData>>,
): string {
  const rows: string[] = [];

  rows.push("=== Students ===");
  rows.push(
    "Name,Email,Avg Score (%),Total Attempts,Avg Attempts/Problem,Completion (%),Last Active",
  );

  data.students.forEach((student) => {
    rows.push(
      [
        escapeCsv(student.student.name),
        escapeCsv(student.student.email),
        student.avgScore.toFixed(1),
        student.totalAttempts,
        student.avgAttemptsPerProblem.toFixed(1),
        student.completionPercentage.toFixed(1),
        student.lastActive
          ? new Date(student.lastActive).toISOString()
          : "",
      ].join(","),
    );
  });

  rows.push("");
  rows.push("=== Problems ===");
  rows.push(
    "Number,Title,Difficulty,Tier,Success Rate (%),Failure Rate (%),Attempted,Total Attempts,Avg Time (min),Accepted",
  );

  data.problems.forEach((problem) => {
    rows.push(
      [
        problem.problem.number,
        escapeCsv(problem.problem.title),
        escapeCsv(problem.problem.difficulty),
        problem.difficultyTier,
        problem.successRate.toFixed(1),
        problem.failureRate.toFixed(1),
        `${problem.attemptedCount}/${problem.totalStudents}`,
        problem.totalAttempts,
        problem.avgTime.toFixed(1),
        problem.acceptedCount,
      ].join(","),
    );
  });

  rows.push("");
  rows.push("=== Exams ===");
  rows.push(
    "Title,Status,Duration (min),Avg Score (%),Completion Rate (%),Enrolled,Completed,Attempted",
  );

  data.exams.forEach((exam) => {
    const analytics = exam.groupExamAnalytics[0];
    rows.push(
      [
        escapeCsv(exam.title),
        exam.status,
        exam.durationMin,
        analytics ? analytics.avgScore.toFixed(1) : "",
        analytics ? (analytics.completionRate * 100).toFixed(1) : "",
        analytics ? analytics.totalEnrolled : "",
        analytics ? analytics.totalCompleted : "",
        analytics ? analytics.totalAttempted : "",
      ].join(","),
    );
  });

  return rows.join("\r\n");
}
