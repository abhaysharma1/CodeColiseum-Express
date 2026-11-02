import type { Prisma } from "../../../generated/prisma/client";
import prisma from "@/infrastructure/database/prisma";

export async function findGroupById(groupId: string) {
  return prisma.group.findUnique({ where: { id: groupId } });
}

export async function findGroupOverallStats(groupId: string) {
  return prisma.groupOverallStats.findUnique({ where: { groupId } });
}

export async function findGroupProblemStats(params: {
  groupId: string;
  searchValue?: string;
  take: number;
  skip: number;
}) {
  return prisma.groupProblemStats.findMany({
    where: {
      groupId: params.groupId,
      ...(params.searchValue
        ? {
            problem: {
              title: {
                contains: params.searchValue,
                mode: "insensitive" as const,
              },
            },
          }
        : {}),
    },
    include: {
      problem: {
        select: {
          id: true,
          number: true,
          title: true,
          difficulty: true,
        },
      },
    },
    take: params.take,
    skip: params.skip,
    orderBy: { attemptedCount: "desc" },
  });
}

export async function findStudentOverallStats(groupId: string) {
  return prisma.studentOverallStats.findMany({
    where: { groupId },
    include: {
      student: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { avgScore: "desc" },
  });
}

export async function findStudentProblemStats(params: {
  groupId: string;
  studentId: string;
}) {
  return prisma.studentProblemStats.findMany({
    where: { groupId: params.groupId, studentId: params.studentId },
    include: {
      problem: {
        select: {
          id: true,
          number: true,
          title: true,
          difficulty: true,
        },
      },
    },
    orderBy: { attempts: "desc" },
  });
}

export async function countStudentStats(
  where: Prisma.StudentOverallStatsWhereInput,
) {
  return prisma.studentOverallStats.count({ where });
}

export async function findStudentStatsPage(params: {
  where: Prisma.StudentOverallStatsWhereInput;
  orderBy: Prisma.StudentOverallStatsOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  return prisma.studentOverallStats.findMany({
    where: params.where,
    include: {
      student: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: params.orderBy,
    skip: params.skip,
    take: params.take,
  });
}

export async function findStudentScores(groupId: string) {
  return prisma.studentOverallStats.findMany({
    where: { groupId },
    select: { studentId: true, avgScore: true },
    orderBy: { avgScore: "desc" },
  });
}

export async function findStudentProblemStatsDetailed(params: {
  groupId: string;
  studentId: string;
}) {
  return prisma.studentProblemStats.findMany({
    where: { groupId: params.groupId, studentId: params.studentId },
    include: {
      problem: {
        select: {
          id: true,
          number: true,
          title: true,
          difficulty: true,
        },
      },
    },
    orderBy: { attempts: "desc" },
  });
}

export async function findRecentStudentSubmissions(
  studentId: string,
  take = 10,
) {
  return prisma.submission.findMany({
    where: { userId: studentId, examId: { not: null } },
    include: {
      problem: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function findStudentExamResults(studentId: string, take = 10) {
  return prisma.examResult.findMany({
    where: { userId: studentId },
    include: { exam: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function findGroupStudentStatSummary(groupId: string) {
  return prisma.studentOverallStats.findMany({
    where: { groupId },
    select: {
      avgScore: true,
      avgAttemptsPerProblem: true,
      completionPercentage: true,
      lastActive: true,
    },
  });
}

export async function findWeakestProblemStats(groupId: string) {
  return prisma.groupProblemStats.findMany({
    where: { groupId },
    select: { problemId: true, successRate: true, failureRate: true },
    orderBy: { successRate: "asc" },
    take: 5,
  });
}

export async function findHardestProblemStat(groupId: string) {
  return prisma.groupProblemStats.findFirst({
    where: { groupId },
    orderBy: { failureRate: "desc" },
    select: { problemId: true },
  });
}

export async function findProblemSummaries(problemIds: string[]) {
  if (problemIds.length === 0) {
    return [];
  }

  return prisma.problem.findMany({
    where: { id: { in: problemIds } },
    select: { id: true, title: true, number: true },
  });
}

export async function findProblemDetailsByIds(problemIds: string[]) {
  if (problemIds.length === 0) {
    return [];
  }

  return prisma.problem.findMany({
    where: { id: { in: problemIds } },
    select: { id: true, number: true, title: true, difficulty: true },
  });
}

export async function findScoreDistributionData(groupId: string) {
  return prisma.studentOverallStats.findMany({
    where: { groupId },
    select: { avgScore: true },
  });
}

export async function findCompletionDistributionData(groupId: string) {
  return prisma.studentOverallStats.findMany({
    where: { groupId },
    select: { completionPercentage: true },
  });
}

export async function findGroupTrendResults(groupId: string, since: Date) {
  return prisma.examResult.findMany({
    where: {
      exam: { examGroups: { some: { groupId } } },
      createdAt: { gte: since },
    },
    select: { createdAt: true, score: true },
  });
}

export async function findProblemTimeStats(groupId: string) {
  return prisma.groupProblemStats.findMany({
    where: { groupId },
    select: { problemId: true, avgTime: true },
    orderBy: { avgTime: "desc" },
    take: 10,
  });
}

export async function countGroupProblemStats(
  where: Prisma.GroupProblemStatsWhereInput,
) {
  return prisma.groupProblemStats.count({ where });
}

export async function findGroupProblemStatsPage(params: {
  where: Prisma.GroupProblemStatsWhereInput;
  orderBy: Prisma.GroupProblemStatsOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  return prisma.groupProblemStats.findMany({
    where: params.where,
    include: {
      problem: {
        select: { id: true, number: true, title: true, difficulty: true },
      },
    },
    orderBy: params.orderBy,
    skip: params.skip,
    take: params.take,
  });
}

export async function findGroupProblemStat(params: {
  groupId: string;
  problemId: string;
}) {
  return prisma.groupProblemStats.findUnique({
    where: {
      groupId_problemId: {
        groupId: params.groupId,
        problemId: params.problemId,
      },
    },
    include: {
      problem: {
        select: { id: true, number: true, title: true, difficulty: true },
      },
    },
  });
}

export async function countStudentProblemStats(
  where: Prisma.StudentProblemStatsWhereInput,
) {
  return prisma.studentProblemStats.count({ where });
}

export async function findStudentProblemStatsPage(params: {
  where: Prisma.StudentProblemStatsWhereInput;
  skip: number;
  take: number;
}) {
  return prisma.studentProblemStats.findMany({
    where: params.where,
    include: {
      student: { select: { id: true, name: true, email: true } },
    },
    orderBy: { attempts: "desc" },
    skip: params.skip,
    take: params.take,
  });
}

export async function countExams(where: Prisma.ExamWhereInput) {
  return prisma.exam.count({ where });
}

export async function findExamsForAnalytics(params: {
  where: Prisma.ExamWhereInput;
  orderBy: Prisma.ExamOrderByWithRelationInput;
  skip: number;
  take: number;
  groupId: string;
}) {
  return prisma.exam.findMany({
    where: params.where,
    orderBy: params.orderBy,
    skip: params.skip,
    take: params.take,
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      durationMin: true,
      groupExamAnalytics: {
        where: { groupId: params.groupId },
        take: 1,
      },
    },
  });
}

export async function findAllExamsForGroup(groupId: string) {
  return prisma.exam.findMany({
    where: { examGroups: { some: { groupId } } },
    orderBy: { endDate: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      durationMin: true,
      groupExamAnalytics: {
        where: { groupId },
        take: 1,
      },
    },
  });
}

export async function findGroupExamAnalytics(params: {
  groupId: string;
  examId: string;
}) {
  return prisma.groupExamAnalytics.findUnique({
    where: {
      groupId_examId: {
        groupId: params.groupId,
        examId: params.examId,
      },
    },
    include: {
      exam: {
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          endDate: true,
          durationMin: true,
        },
      },
    },
  });
}

export async function findAllGroupProblemStats(groupId: string) {
  return prisma.groupProblemStats.findMany({
    where: { groupId },
    include: {
      problem: {
        select: { id: true, number: true, title: true, difficulty: true },
      },
    },
    orderBy: { attemptedCount: "desc" },
  });
}
