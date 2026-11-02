import type { Prisma } from "../../../generated/prisma/client";
import { ExamAttemptStatus } from "../../../generated/prisma/enums";
import prisma from "@/infrastructure/database/prisma";

type TransactionClient = Prisma.TransactionClient;

export async function findExamById(examId: string) {
  return prisma.exam.findUnique({ where: { id: examId } });
}

export async function findExamWithProblems(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    include: { problems: { select: { id: true } } },
  });
}

export async function findExamProblems(examId: string) {
  return prisma.examProblem.findMany({
    where: { examId },
    include: {
      problem: {
        select: {
          title: true,
          difficulty: true,
          number: true,
        },
      },
    },
  });
}

export async function findExamAttempt(examId: string, studentId: string) {
  return prisma.examAttempt.findUnique({
    where: {
      examId_studentId: { examId, studentId },
    },
  });
}

export async function findAttemptById(attemptId: string) {
  return prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, studentId: true },
  });
}

export async function findAttemptSubmissions(
  attemptId: string,
  problemId: string,
) {
  return prisma.submission.findMany({
    where: { attemptId, problemId },
  });
}

export async function findExamSubmissionsForStudent(params: {
  examId: string;
  userId: string;
}) {
  return prisma.submission.findMany({
    where: {
      userId: params.userId,
      examId: params.examId,
    },
    select: {
      problemId: true,
      status: true,
      passedTestcases: true,
      totalTestcases: true,
    },
  });
}

export async function findProblemWithTags(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    include: { tags: { include: { tag: true } } },
  });
}

export async function findRunTestCases(problemId: string) {
  return prisma.runTestCase.findFirst({
    where: { problemId },
  });
}

export async function touchAttemptHeartbeats(userId: string) {
  return prisma.examAttempt.updateMany({
    where: {
      studentId: userId,
      status: ExamAttemptStatus.IN_PROGRESS,
    },
    data: { lastHeartbeatAt: new Date() },
  });
}

export async function upsertAttemptStart(params: {
  examId: string;
  studentId: string;
  expiresAt: Date;
}) {
  const now = new Date();

  return prisma.examAttempt.upsert({
    where: {
      examId_studentId: {
        examId: params.examId,
        studentId: params.studentId,
      },
    },
    update: { lastHeartbeatAt: now },
    create: {
      examId: params.examId,
      studentId: params.studentId,
      status: ExamAttemptStatus.IN_PROGRESS,
      lastHeartbeatAt: now,
      startedAt: now,
      expiresAt: params.expiresAt,
    },
  });
}

/**
 * Persists the final attempt state and the result row atomically.
 */
export async function persistSubmittedAttempt(
  client: TransactionClient,
  params: {
    attemptId: string;
    examId: string;
    userId: string;
    totalScore: number;
    submittedAt: Date;
  },
) {
  const attempt = await client.examAttempt.update({
    where: { id: params.attemptId },
    data: {
      status: ExamAttemptStatus.SUBMITTED,
      submittedAt: params.submittedAt,
      totalScore: params.totalScore,
    },
  });

  const result = await client.examResult.create({
    data: {
      score: params.totalScore,
      examId: params.examId,
      userId: params.userId,
    },
  });

  return { attempt, result };
}
