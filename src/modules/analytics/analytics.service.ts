import type { Prisma } from "../../../generated/prisma/client";
import * as analyticsRepository from "./analytics.repository";
import type {
  OrgStudentsQuery,
  PaginationQuery,
} from "./analytics.schema";

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

export async function getOrgOverview() {
  const cached = await analyticsRepository.findOrganizationAnalytics();

  if (cached) {
    return cached;
  }

  const [groups, avgScore] = await Promise.all([
    analyticsRepository.findGroupMemberTotals(),
    analyticsRepository.averageExamResultScore(),
  ]);

  const totalStudents = groups.reduce(
    (sum, group) => sum + group._count.members,
    0,
  );

  return {
    totalGroups: groups.length,
    totalStudents,
    avgScore: roundTwo(avgScore),
    completionRate: 0,
    overallPassRate: 0,
  };
}

export async function getOrgGroups(query: PaginationQuery) {
  const skip = (query.page - 1) * query.limit;

  const [total, groups] = await Promise.all([
    analyticsRepository.countGroups(),
    analyticsRepository.findGroupsForAnalytics({
      skip,
      take: query.limit,
    }),
  ]);

  const data = groups.map((group) => ({
    id: group.id,
    name: group.name,
    creator: {
      id: group.creator.id,
      name: group.creator.name,
      email: group.creator.email,
    },
    totalStudents: group.members.length,
    totalExams: group.groupOverallStats?.totalExams ?? 0,
    avgScore: group.groupOverallStats?.avgScoreAllExams ?? 0,
    completionRate: group.groupOverallStats?.completionRate ?? 0,
    passRate: group.groupOverallStats?.overallPassRate ?? 0,
  }));

  return {
    data,
    pagination: buildPagination(query.page, query.limit, total),
  };
}

export async function getOrgStudents(query: OrgStudentsQuery) {
  const skip = (query.page - 1) * query.limit;

  const where: Prisma.StudentOverallStatsWhereInput = {};

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

  if (query.groupId) {
    where.groupId = query.groupId;
  }

  const [total, students] = await Promise.all([
    analyticsRepository.countStudentStats(where),
    analyticsRepository.findStudentStats({
      where,
      skip,
      take: query.limit,
    }),
  ]);

  const data = students.map((stat) => ({
    id: stat.studentId,
    name: stat.student.name,
    email: stat.student.email,
    group: { id: stat.group.id, name: stat.group.name },
    avgScore: stat.avgScore,
    totalExams: stat.totalExams,
    completionPercentage: stat.completionPercentage,
    lastActive: stat.lastActive,
  }));

  return {
    data,
    pagination: buildPagination(query.page, query.limit, total),
  };
}

export async function getOrgExams(query: PaginationQuery) {
  const skip = (query.page - 1) * query.limit;

  const [total, exams] = await Promise.all([
    analyticsRepository.countExams(),
    analyticsRepository.findExamsForAnalytics({ skip, take: query.limit }),
  ]);

  const data = exams.map((exam) => ({
    id: exam.id,
    title: exam.title,
    creator: { id: exam.creator.id, name: exam.creator.name },
    groups: exam.examGroups.length,
    totalEnrolled: exam.examAnalytics?.totalEnrolled ?? 0,
    totalCompleted: exam.examAnalytics?.totalCompleted ?? 0,
    avgScore: exam.examAnalytics?.avgScore ?? 0,
    completionRate: exam.examAnalytics?.completionRate ?? 0,
    status: exam.status,
    createdAt: exam.createdAt,
  }));

  return {
    data,
    pagination: buildPagination(query.page, query.limit, total),
  };
}

export async function getOrgProblems(query: PaginationQuery) {
  const skip = (query.page - 1) * query.limit;

  const [total, problems] = await Promise.all([
    analyticsRepository.countProblems(),
    analyticsRepository.findProblemStatsForAnalytics({
      skip,
      take: query.limit,
    }),
  ]);

  const data = problems.map((problem) => ({
    id: problem.problemId,
    number: problem.problem.number,
    title: problem.problem.title,
    difficulty: problem.problem.difficulty,
    successRate: problem.successRate,
    failureRate: problem.failureRate,
    totalAttempts: problem.totalAttempts,
  }));

  return {
    data,
    pagination: buildPagination(query.page, query.limit, total),
  };
}

export async function getTeacherDashboardSummary(userId: string) {
  const groupIds = await analyticsRepository.findGroupIdsByCreator(userId);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [
    totalTests,
    activeStudents,
    averageScore,
    totalEnrollments,
    completedEnrollments,
    testsThisMonth,
    recentStudentsCount,
    previousStudentsCount,
    recentAvg,
    prevAvg,
  ] = await Promise.all([
    analyticsRepository.countExamsByCreator(userId),
    analyticsRepository.countGroupMembers(groupIds),
    analyticsRepository.averageAttemptScoreByCreator(userId),
    analyticsRepository.countEnrollmentsByCreator(userId),
    analyticsRepository.countSubmittedAttemptsByCreator(userId),
    analyticsRepository.countExamsByCreatorSince(userId, startOfMonth),
    analyticsRepository.countMembersAddedBetween({
      groupIds,
      from: sevenDaysAgo,
    }),
    analyticsRepository.countMembersAddedBetween({
      groupIds,
      from: fourteenDaysAgo,
      to: sevenDaysAgo,
    }),
    analyticsRepository.averageAttemptScoreBetween({
      userId,
      from: sevenDaysAgo,
    }),
    analyticsRepository.averageAttemptScoreBetween({
      userId,
      from: fourteenDaysAgo,
      to: sevenDaysAgo,
    }),
  ]);

  const completionRate =
    totalEnrollments > 0 ? (completedEnrollments / totalEnrollments) * 100 : 0;

  const activeStudentsTrend =
    previousStudentsCount > 0
      ? ((recentStudentsCount - previousStudentsCount) /
          previousStudentsCount) *
        100
      : 0;

  const averageScoreTrend =
    prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;

  return {
    activeStudents,
    totalTests,
    averageScore: roundTwo(averageScore),
    completionRate: roundTwo(completionRate),
    testsThisMonth,
    activeStudentsTrend: roundTwo(activeStudentsTrend),
    averageScoreTrend: roundTwo(averageScoreTrend),
  };
}

export async function getTeacherChartData(userId: string, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  // One query instead of one per day; buckets are computed in memory.
  const attempts = await analyticsRepository.findAttemptScoresBetween({
    userId,
    from: startDate,
    to: endDate,
  });

  const chartData: {
    date: string;
    avgScore: number;
    studentCount: number;
  }[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayAttempts = attempts.filter(
      (attempt) =>
        attempt.startedAt >= date && attempt.startedAt < nextDate,
    );

    const avgScore =
      dayAttempts.length > 0
        ? dayAttempts.reduce(
            (sum, attempt) => sum + (attempt.totalScore || 0),
            0,
          ) / dayAttempts.length
        : 0;

    chartData.push({
      date: date.toLocaleDateString("en-US", { weekday: "short" }),
      avgScore: roundTwo(avgScore),
      studentCount: dayAttempts.length,
    });
  }

  return chartData;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: Date;
  metadata: Record<string, string>;
}

export async function getRecentActivity(userId: string, limit: number) {
  const [recentExams, recentAttempts, recentGroups] = await Promise.all([
    analyticsRepository.findRecentExamsByCreator(userId, limit),
    analyticsRepository.findRecentAttemptsByCreator(userId, limit),
    analyticsRepository.findRecentGroupsByCreator(userId, limit),
  ]);

  const activities: ActivityItem[] = [
    ...recentExams.map((exam) => ({
      id: exam.id,
      type: exam.isPublished ? "exam_published" : "exam_created",
      title: `${exam.isPublished ? "Published" : "Created"} exam: ${exam.title}`,
      timestamp: exam.createdAt,
      metadata: { examId: exam.id },
    })),
    ...recentAttempts.map((attempt) => ({
      id: attempt.id,
      type: "student_submission",
      title: `${attempt.student.name} completed exam: ${attempt.exam.title}`,
      description: `Status: ${attempt.status}`,
      timestamp: attempt.startedAt,
      metadata: { studentId: attempt.student.email },
    })),
    ...recentGroups.map((group) => ({
      id: group.id,
      type: "group_created",
      title: `Created group: ${group.name}`,
      description: `${group._count.members} students added`,
      timestamp: group.createdAt,
      metadata: { groupId: group.id },
    })),
  ];

  return activities
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, limit);
}

export async function getTopStudents(userId: string, limit: number) {
  const stats = await analyticsRepository.findTopStudentStats(userId, limit);

  return stats.map((stat, index) => ({
    id: stat.student.id,
    name: stat.student.name,
    email: stat.student.email,
    rank: index + 1,
    avgScore: roundTwo(stat.avgScore),
    completionPercentage: roundTwo(stat.completionPercentage),
  }));
}
