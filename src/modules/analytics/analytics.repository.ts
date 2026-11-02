import type { Prisma } from "../../../generated/prisma/client";
import prisma from "@/infrastructure/database/prisma";

export async function findOrganizationAnalytics(organizationId = "all") {
  return prisma.organizationAnalytics.findUnique({
    where: { organizationId },
  });
}

export async function findGroupMemberTotals() {
  return prisma.group.findMany({
    select: {
      id: true,
      _count: { select: { members: true } },
    },
  });
}

export async function averageExamResultScore() {
  const aggregate = await prisma.examResult.aggregate({
    _avg: { score: true },
  });

  return aggregate._avg.score ?? 0;
}

export async function countGroups() {
  return prisma.group.count();
}

export async function findGroupsForAnalytics(params: {
  skip: number;
  take: number;
}) {
  return prisma.group.findMany({
    include: {
      groupOverallStats: true,
      members: { select: { userId: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
    skip: params.skip,
    take: params.take,
    orderBy: { createdAt: "desc" },
  });
}

export async function countStudentStats(
  where: Prisma.StudentOverallStatsWhereInput,
) {
  return prisma.studentOverallStats.count({ where });
}

export async function findStudentStats(params: {
  where: Prisma.StudentOverallStatsWhereInput;
  skip: number;
  take: number;
}) {
  return prisma.studentOverallStats.findMany({
    where: params.where,
    include: {
      student: { select: { id: true, name: true, email: true } },
      group: { select: { id: true, name: true } },
    },
    orderBy: { avgScore: "desc" },
    skip: params.skip,
    take: params.take,
  });
}

export async function countExams() {
  return prisma.exam.count();
}

export async function findExamsForAnalytics(params: {
  skip: number;
  take: number;
}) {
  return prisma.exam.findMany({
    include: {
      examAnalytics: true,
      creator: { select: { id: true, name: true } },
      examGroups: { select: { groupId: true } },
    },
    skip: params.skip,
    take: params.take,
    orderBy: { createdAt: "desc" },
  });
}

export async function findProblemStatsForAnalytics(params: {
  skip: number;
  take: number;
}) {
  return prisma.groupProblemStats.findMany({
    select: {
      problemId: true,
      successRate: true,
      failureRate: true,
      totalAttempts: true,
      problem: {
        select: {
          id: true,
          number: true,
          title: true,
          difficulty: true,
        },
      },
    },
    orderBy: { failureRate: "desc" },
    skip: params.skip,
    take: params.take,
  });
}

export async function countProblems() {
  return prisma.problem.count();
}

export async function findGroupIdsByCreator(userId: string) {
  const groups = await prisma.group.findMany({
    where: { creatorId: userId },
    select: { id: true },
  });

  return groups.map((group) => group.id);
}

export async function countExamsByCreator(userId: string) {
  return prisma.exam.count({ where: { creatorId: userId } });
}

export async function countGroupMembers(groupIds: string[]) {
  if (groupIds.length === 0) {
    return 0;
  }

  return prisma.groupMember.count({
    where: { groupId: { in: groupIds } },
  });
}

export async function averageAttemptScoreByCreator(userId: string) {
  const aggregate = await prisma.examAttempt.aggregate({
    where: { exam: { creatorId: userId } },
    _avg: { totalScore: true },
  });

  return aggregate._avg?.totalScore ?? 0;
}

export async function countEnrollmentsByCreator(userId: string) {
  return prisma.examEnrollment.count({
    where: { exam: { creatorId: userId } },
  });
}

export async function countSubmittedAttemptsByCreator(userId: string) {
  return prisma.examAttempt.count({
    where: {
      exam: { creatorId: userId },
      status: { in: ["SUBMITTED"] },
    },
  });
}

export async function countExamsByCreatorSince(userId: string, since: Date) {
  return prisma.exam.count({
    where: {
      creatorId: userId,
      createdAt: { gte: since },
    },
  });
}

export async function countMembersAddedBetween(params: {
  groupIds: string[];
  from: Date;
  to?: Date;
}) {
  if (params.groupIds.length === 0) {
    return 0;
  }

  return prisma.groupMember.count({
    where: {
      groupId: { in: params.groupIds },
      addedAt: {
        gte: params.from,
        ...(params.to ? { lt: params.to } : {}),
      },
    },
  });
}

export async function averageAttemptScoreBetween(params: {
  userId: string;
  from: Date;
  to?: Date;
}) {
  const aggregate = await prisma.examAttempt.aggregate({
    where: {
      exam: { creatorId: params.userId },
      startedAt: {
        gte: params.from,
        ...(params.to ? { lt: params.to } : {}),
      },
    },
    _avg: { totalScore: true },
  });

  return aggregate._avg?.totalScore ?? 0;
}

export async function findAttemptScoresBetween(params: {
  userId: string;
  from: Date;
  to: Date;
}) {
  return prisma.examAttempt.findMany({
    where: {
      exam: { creatorId: params.userId },
      startedAt: { gte: params.from, lt: params.to },
    },
    select: { startedAt: true, totalScore: true },
  });
}

export async function findRecentExamsByCreator(userId: string, limit: number) {
  return prisma.exam.findMany({
    where: { creatorId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      createdAt: true,
      isPublished: true,
    },
  });
}

export async function findRecentAttemptsByCreator(
  userId: string,
  limit: number,
) {
  return prisma.examAttempt.findMany({
    where: { exam: { creatorId: userId } },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      student: { select: { name: true, email: true } },
      exam: { select: { title: true } },
      startedAt: true,
      status: true,
    },
  });
}

export async function findRecentGroupsByCreator(
  userId: string,
  limit: number,
) {
  return prisma.group.findMany({
    where: { creatorId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });
}

export async function findTopStudentStats(userId: string, limit: number) {
  return prisma.studentOverallStats.findMany({
    where: {
      group: { creatorId: userId },
    },
    orderBy: { avgScore: "desc" },
    take: limit,
    select: {
      student: {
        select: { id: true, name: true, email: true },
      },
      avgScore: true,
      completionPercentage: true,
    },
  });
}
