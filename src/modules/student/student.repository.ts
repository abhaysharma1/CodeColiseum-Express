import type { Prisma } from "../../../generated/prisma/client";
import prisma from "@/infrastructure/database/prisma";
import type { StudentGroupsQuery } from "./student.schema";

export async function findDashboardGroups(userId: string) {
  return prisma.group.findMany({
    where: {
      members: {
        some: { userId },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

export async function findDashboardExams(userId: string, now: Date) {
  return prisma.exam.findMany({
    where: {
      examGroups: {
        some: {
          group: {
            members: {
              some: { userId },
            },
          },
        },
      },
      isPublished: true,
      endDate: { gte: now },
    },
  });
}

export async function findPreviousResults(userId: string) {
  return prisma.examResult.findMany({
    where: { userId },
    take: 10,
  });
}

export async function findSolvedProblems(userId: string) {
  return prisma.selfSubmission.findMany({
    where: {
      userId,
      status: "ACCEPTED",
    },
    include: {
      problem: {
        select: { difficulty: true },
      },
    },
    distinct: ["problemId"],
  });
}

export async function countProblems() {
  return prisma.problem.count();
}

export async function findExamForResult(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      problems: {
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
        orderBy: {
          order: "asc",
        },
      },
    },
  });
}

export async function findAttemptForStudent(examId: string, studentId: string) {
  return prisma.examAttempt.findUnique({
    where: {
      examId_studentId: { examId, studentId },
    },
  });
}

export async function findFinalSubmissions(attemptId: string) {
  return prisma.submission.findMany({
    where: {
      attemptId,
      isFinal: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function findRankedAttempts(examId: string) {
  return prisma.examAttempt.findMany({
    where: {
      examId,
      status: {
        in: ["SUBMITTED", "AUTO_SUBMITTED"],
      },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ totalScore: "desc" }, { submittedAt: "asc" }],
  });
}

export async function findExam(examId: string) {
  return prisma.exam.findUnique({ where: { id: examId } });
}

export async function findAiEvaluations(examId: string, userId: string) {
  return prisma.aiEvaluation.findMany({
    where: {
      submission: {
        examId,
        userId,
      },
    },
    include: {
      submission: {
        include: {
          problem: true,
        },
      },
    },
  });
}

export async function findGroupsForStudent(
  userId: string,
  query: StudentGroupsQuery,
) {
  const where: Prisma.GroupWhereInput = {
    members: {
      some: { userId },
    },
  };

  if (query.searchValue) {
    where.OR = [
      { name: { contains: query.searchValue, mode: "insensitive" } },
      { description: { contains: query.searchValue, mode: "insensitive" } },
    ];
  }

  if (query.groupType) {
    where.type = query.groupType;
  }

  return prisma.group.findMany({
    where,
    take: query.take,
    skip: query.skip,
    include: { creator: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function findGroupById(groupId: string) {
  return prisma.group.findUnique({ where: { id: groupId } });
}

export async function findGroupMembership(groupId: string, userId: string) {
  return prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
  });
}

export async function findGroupExams(params: {
  groupId: string;
  take: number;
  skip: number;
  searchValue: string;
}) {
  return prisma.exam.findMany({
    where: {
      isPublished: true,
      examGroups: {
        some: { groupId: params.groupId },
      },
      ...(params.searchValue
        ? {
            title: {
              contains: params.searchValue,
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    take: params.take,
    skip: params.skip,
    orderBy: { endDate: "desc" },
  });
}

export async function findAttemptsForExams(
  userId: string,
  examIds: string[],
) {
  if (examIds.length === 0) {
    return [];
  }

  return prisma.examAttempt.findMany({
    where: {
      studentId: userId,
      examId: { in: examIds },
    },
    select: {
      examId: true,
      status: true,
      submittedAt: true,
      totalScore: true,
    },
  });
}

export async function findUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}
