import type { Prisma } from "../../../generated/prisma/client";
import { ExamAttemptStatus, ExamStatus } from "../../../generated/prisma/enums";
import prisma from "@/infrastructure/database/prisma";

type TransactionClient = Prisma.TransactionClient;

export async function findExpiredExams(now: Date) {
  return prisma.exam.findMany({
    where: {
      endDate: { lt: now },
      status: {
        notIn: [
          ExamStatus.completed,
          ExamStatus.finished,
          ExamStatus.ai_processing,
        ],
      },
    },
    include: {
      examGroups: true,
      problems: { select: { id: true } },
    },
  });
}

export async function findActiveAttempts(examId: string) {
  return prisma.examAttempt.findMany({
    where: {
      examId,
      status: ExamAttemptStatus.IN_PROGRESS,
    },
  });
}

export async function findFinalSubmissionsByAttemptIds(attemptIds: string[]) {
  if (attemptIds.length === 0) {
    return [];
  }

  return prisma.submission.findMany({
    where: {
      attemptId: { in: attemptIds },
      isFinal: true,
    },
    select: {
      attemptId: true,
      passedTestcases: true,
      totalTestcases: true,
    },
  });
}

export async function persistExamFinalization(
  client: TransactionClient,
  params: {
    examId: string;
    attempts: {
      attemptId: string;
      studentId: string;
      totalScore: number;
    }[];
    finalizedAt: Date;
  },
): Promise<void> {
  for (const attempt of params.attempts) {
    await client.examResult.create({
      data: {
        examId: params.examId,
        userId: attempt.studentId,
        score: attempt.totalScore,
      },
    });

    await client.examAttempt.update({
      where: { id: attempt.attemptId },
      data: {
        status: ExamAttemptStatus.AUTO_SUBMITTED,
        submittedAt: params.finalizedAt,
        totalScore: attempt.totalScore,
      },
    });
  }

  await client.exam.update({
    where: { id: params.examId },
    data: { status: ExamStatus.completed },
  });
}

export async function findExamIdsForGroup(groupId: string) {
  const examGroups = await prisma.examGroup.findMany({
    where: { groupId },
    select: { examId: true },
  });

  return examGroups.map((examGroup) => examGroup.examId);
}

export async function findResultsForExams(examIds: string[]) {
  return prisma.examResult.findMany({
    where: { examId: { in: examIds } },
    select: { userId: true, examId: true, score: true },
  });
}

export async function countGroupMembers(groupId: string) {
  return prisma.groupMember.count({ where: { groupId } });
}

export async function findGroupMemberIds(groupId: string) {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });

  return members.map((member) => member.userId);
}

export async function upsertGroupStats(
  client: TransactionClient,
  params: {
    groupId: string;
    totalExams: number;
    totalStudents: number;
    avgScoreAllExams: number;
    overallPassRate: number;
    highestExamAvg: number;
    lowestExamAvg: number;
  },
) {
  return client.groupOverallStats.upsert({
    where: { groupId: params.groupId },
    create: {
      groupId: params.groupId,
      totalExams: params.totalExams,
      totalStudents: params.totalStudents,
      avgScoreAllExams: params.avgScoreAllExams,
      overallPassRate: params.overallPassRate,
      highestExamAvg: params.highestExamAvg,
      lowestExamAvg: params.lowestExamAvg,
    },
    update: {
      totalExams: params.totalExams,
      totalStudents: params.totalStudents,
      avgScoreAllExams: params.avgScoreAllExams,
      overallPassRate: params.overallPassRate,
      highestExamAvg: params.highestExamAvg,
      lowestExamAvg: params.lowestExamAvg,
    },
  });
}

export async function upsertStudentStats(
  client: TransactionClient,
  params: {
    groupId: string;
    studentId: string;
    totalScore: number;
    totalExams: number;
    avgScore: number;
  },
) {
  return client.studentOverallStats.upsert({
    where: {
      groupId_studentId: {
        groupId: params.groupId,
        studentId: params.studentId,
      },
    },
    create: {
      groupId: params.groupId,
      studentId: params.studentId,
      totalScore: params.totalScore,
      totalExams: params.totalExams,
      avgScore: params.avgScore,
      totalAttempts: 0,
    },
    update: {
      totalScore: params.totalScore,
      totalExams: params.totalExams,
      avgScore: params.avgScore,
    },
  });
}

export async function findExamGroupPairs(filters: {
  examId?: string;
  groupId?: string;
}) {
  return prisma.examGroup.findMany({
    where: {
      ...(filters.examId ? { examId: filters.examId } : {}),
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
    },
    select: { examId: true, groupId: true },
  });
}
