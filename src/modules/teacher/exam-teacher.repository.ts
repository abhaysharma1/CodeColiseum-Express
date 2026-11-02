import type { Prisma } from "../../../generated/prisma/client";
import {
  AiProcessingStatus,
  ExamStatus,
} from "../../../generated/prisma/enums";
import prisma from "@/infrastructure/database/prisma";
import { runInTransaction } from "@/infrastructure/database/transactions";

/**
 * Prisma access for the teacher exam builder, results and bulk actions.
 * Business rules live in `exam-teacher.service.ts`.
 */

export async function findExamsForListing(
  where: Prisma.ExamWhereInput,
  orderBy: Prisma.ExamOrderByWithRelationInput,
) {
  return prisma.exam.findMany({
    where,
    orderBy,
    include: {
      _count: {
        select: { problems: true },
      },
      creator: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

export async function findAttemptScoresForExams(examIds: string[]) {
  if (examIds.length === 0) {
    return [];
  }

  return prisma.examAttempt.findMany({
    where: { examId: { in: examIds } },
    select: { examId: true, totalScore: true },
  });
}

export async function findExamGroupLinks(examIds: string[]) {
  if (examIds.length === 0) {
    return [];
  }

  return prisma.examGroup.findMany({
    where: { examId: { in: examIds } },
    select: { examId: true, groupId: true },
  });
}

export async function findGroupMemberLinks(groupIds: string[]) {
  if (groupIds.length === 0) {
    return [];
  }

  return prisma.groupMember.findMany({
    where: { groupId: { in: groupIds } },
    select: { groupId: true, userId: true },
  });
}

export async function findAllExamsForDashboard() {
  return prisma.exam.findMany({
    select: {
      id: true,
      creatorId: true,
      isPublished: true,
      startDate: true,
      endDate: true,
    },
  });
}

export async function findExamsByIds(ids: string[]) {
  return prisma.exam.findMany({
    where: { id: { in: ids } },
    select: { id: true, creatorId: true },
  });
}

export async function publishExamsByIds(ids: string[]): Promise<void> {
  await prisma.exam.updateMany({
    where: { id: { in: ids } },
    data: { isPublished: true },
  });
}

export async function deleteExamsByIds(ids: string[]): Promise<void> {
  await prisma.exam.deleteMany({ where: { id: { in: ids } } });
}

export async function updateExamsStatus(
  ids: string[],
  status: ExamStatus,
): Promise<void> {
  await prisma.exam.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });
}

export async function findExamsForExport(ids: string[]) {
  return prisma.exam.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      isPublished: true,
      status: true,
      createdAt: true,
      startDate: true,
      endDate: true,
      _count: { select: { enrollments: true } },
    },
  });
}

export async function findAttemptScores(examId: string) {
  return prisma.examAttempt.findMany({
    where: { examId },
    select: { totalScore: true },
  });
}

export async function createDraftExam(creatorId: string, now: Date) {
  return prisma.exam.create({
    data: {
      title: "Untitled Exam",
      description: "",
      isPublished: false,
      creatorId,
      startDate: now,
      endDate: new Date(now.getTime() + 60 * 60 * 1000),
      durationMin: 60,
      sebEnabled: false,
      status: ExamStatus.scheduled,
    },
  });
}

export async function findExamWithProblemsAndGroups(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    include: {
      problems: true,
      examGroups: true,
    },
  });
}

export interface CreateExamCopyInput {
  creatorId: string;
  title: string;
  description: string | null;
  durationMin: number;
  sebEnabled: boolean;
  startDate: Date;
  endDate: Date;
  problems: { order: number; problemId: string }[];
  groupIds: string[];
}

export async function createExamCopy(input: CreateExamCopyInput) {
  return prisma.exam.create({
    data: {
      title: input.title,
      description: input.description,
      isPublished: false,
      creatorId: input.creatorId,
      startDate: input.startDate,
      endDate: input.endDate,
      durationMin: input.durationMin,
      sebEnabled: input.sebEnabled,
      status: ExamStatus.scheduled,
      problems: {
        create: input.problems.map((problem) => ({
          order: problem.order,
          problemId: problem.problemId,
        })),
      },
      examGroups: {
        create: input.groupIds.map((groupId) => ({ groupId })),
      },
    },
  });
}

export async function findExamById(examId: string) {
  return prisma.exam.findUnique({ where: { id: examId } });
}

export async function findGroupsForExam(examId: string) {
  return prisma.group.findMany({
    where: {
      examGroups: {
        some: { examId },
      },
    },
  });
}

export async function findExamProblemIds(examId: string) {
  return prisma.examProblem.findMany({
    where: { examId },
    select: { id: true },
  });
}

export async function findProblemsForAccess(problemIds: string[]) {
  if (problemIds.length === 0) {
    return [];
  }

  return prisma.problem.findMany({
    where: { id: { in: problemIds } },
    select: { id: true, ownerId: true, visibility: true, approvalStatus: true },
  });
}

export async function countProblemsByIds(problemIds: string[]): Promise<number> {
  if (problemIds.length === 0) {
    return 0;
  }

  return prisma.problem.count({ where: { id: { in: problemIds } } });
}

export interface PersistExamInput {
  examId: string;
  title: string;
  description: string;
  isPublished: boolean;
  startDate: Date;
  endDate: Date;
  durationMin: number;
  sebEnabled: boolean;
  groupId?: string;
  problemIds: string[];
}

/**
 * Rewrites the exam header plus its group/problem associations atomically.
 * Shared by "save draft" and "publish" so both paths stay consistent.
 */
export async function persistExam(input: PersistExamInput): Promise<void> {
  await runInTransaction(async (tx) => {
    await tx.exam.update({
      where: { id: input.examId },
      data: {
        title: input.title,
        description: input.description,
        isPublished: input.isPublished,
        startDate: input.startDate,
        endDate: input.endDate,
        durationMin: input.durationMin,
        sebEnabled: input.sebEnabled,
      },
    });

    await tx.examGroup.deleteMany({ where: { examId: input.examId } });

    if (input.groupId) {
      await tx.examGroup.create({
        data: { examId: input.examId, groupId: input.groupId },
      });
    }

    await tx.examProblem.deleteMany({ where: { examId: input.examId } });

    if (input.problemIds.length > 0) {
      await tx.examProblem.createMany({
        data: input.problemIds.map((problemId, index) => ({
          examId: input.examId,
          problemId,
          order: index + 1,
        })),
      });
    }
  });
}

export async function findGroupMembersWithRoles(groupIds: string[]) {
  if (groupIds.length === 0) {
    return [];
  }

  return prisma.groupMember.findMany({
    where: { groupId: { in: groupIds } },
    include: {
      user: {
        select: { id: true, globalRoleId: true },
      },
    },
  });
}

export async function findExamWithProblemsForResults(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    include: {
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
        orderBy: { order: "asc" },
      },
    },
  });
}

export async function findExamAttemptsForResults(examId: string) {
  return prisma.examAttempt.findMany({
    where: { examId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      submissions: {
        select: {
          id: true,
          problemId: true,
          status: true,
          passedTestcases: true,
          totalTestcases: true,
          createdAt: true,
          isFinal: true,
          sourceCode: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ totalScore: "desc" }, { submittedAt: "asc" }],
  });
}

export async function findExamWithCreator(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    include: { creator: true },
  });
}

export async function findSubmissionsWithAiEvaluation(examId: string) {
  return prisma.submission.findMany({
    where: {
      examId,
      aiEvaluation: { isNot: null },
    },
    include: {
      aiEvaluation: true,
      user: true,
      problem: {
        select: { id: true, title: true, difficulty: true },
      },
    },
  });
}

export async function updateExamStatus(
  examId: string,
  status: ExamStatus,
): Promise<void> {
  await prisma.exam.update({ where: { id: examId }, data: { status } });
}

export async function findPendingAiSubmissions(examId: string) {
  return prisma.submission.findMany({
    where: {
      examId,
      isFinal: true,
      aiStatus: AiProcessingStatus.PENDING,
    },
    select: { id: true },
  });
}

export async function countFinalSubmissions(examId: string): Promise<number> {
  return prisma.submission.count({ where: { examId, isFinal: true } });
}

export async function countCompletedAiSubmissions(
  examId: string,
): Promise<number> {
  return prisma.submission.count({
    where: {
      examId,
      isFinal: true,
      aiStatus: AiProcessingStatus.COMPLETED,
    },
  });
}

export interface UpdateExamScheduleInput {
  examId: string;
  startDate: Date;
  endDate: Date;
  durationMin: number;
  sebEnabled?: boolean;
}

/**
 * Updates the schedule and keeps already-running attempts in sync, so duration
 * changes also apply to students who have started.
 */
export async function updateExamSchedule(
  input: UpdateExamScheduleInput,
): Promise<void> {
  await runInTransaction(async (tx) => {
    await tx.exam.update({
      where: { id: input.examId },
      data: {
        startDate: input.startDate,
        endDate: input.endDate,
        durationMin: input.durationMin,
        ...(typeof input.sebEnabled === "boolean"
          ? { sebEnabled: input.sebEnabled }
          : {}),
      },
    });

    const activeAttempts = await tx.examAttempt.findMany({
      where: { examId: input.examId, status: "IN_PROGRESS" },
      select: { id: true, startedAt: true },
    });

    for (const attempt of activeAttempts) {
      const expiresAt = new Date(
        Math.min(
          attempt.startedAt.getTime() + input.durationMin * 60 * 1000,
          input.endDate.getTime(),
        ),
      );

      await tx.examAttempt.update({
        where: { id: attempt.id },
        data: { expiresAt },
      });
    }
  });
}
