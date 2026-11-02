import { runInTransaction } from "@/infrastructure/database/transactions";
import { ConflictError, NotFoundError, ForbiddenError } from "@/shared/errors";
import {
  canGiveExamForUser,
  validateAttempt,
  verifySEB,
  type SebRequestContext,
} from "@/utils/exam.utils";
import { normalizeProblemTestCases } from "@/shared/utils/problem-test-cases";
import { runCodeService } from "@/services/codeRunner.service";
import {
  getExamSubmissionStatusService,
  submitCodeService,
} from "@/services/codeSubmission.service";
import * as examRepository from "./exam.repository";
import type { ExamRunCodeBody } from "./exam.schema";

export interface ExamSubmissionScoreInput {
  problemId: string;
  passedTestcases: number;
  totalTestcases: number;
}

/**
 * Keeps the highest percentage achieved per problem, then averages across all
 * exam problems (unsolved problems contribute zero).
 */
export function calculateSubmittedExamScore(
  submissions: ExamSubmissionScoreInput[],
  problemCount: number,
): number {
  const scoreByProblem = new Map<string, number>();

  for (const submission of submissions) {
    const previous = scoreByProblem.get(submission.problemId) ?? 0;
    const score =
      submission.totalTestcases > 0
        ? Math.round(
            (submission.passedTestcases / submission.totalTestcases) * 100,
          )
        : 0;
    scoreByProblem.set(submission.problemId, Math.max(previous, score));
  }

  const rawSum = Array.from(scoreByProblem.values()).reduce(
    (sum, score) => sum + score,
    0,
  );

  return problemCount > 0 ? Math.round(rawSum / problemCount) : 0;
}

async function getExamOrThrow(examId: string, message = "Exam Not Found") {
  const exam = await examRepository.findExamById(examId);

  if (!exam) {
    throw new NotFoundError(message);
  }

  return exam;
}

export async function runExamCode(params: {
  userId: string;
  body: ExamRunCodeBody;
  sebContext: SebRequestContext;
}) {
  const exam = await getExamOrThrow(params.body.examId);

  if (exam.sebEnabled) {
    verifySEB(params.sebContext);
  }

  await canGiveExamForUser(exam, params.userId);
  await validateAttempt(exam.id, params.userId);

  return runCodeService({
    userId: params.userId,
    questionId: params.body.problemId,
    languageId: params.body.languageId,
    code: params.body.sourceCode,
  });
}

export async function getTestProblems(examId: string, userId: string) {
  const exam = await getExamOrThrow(examId);

  await canGiveExamForUser(exam, userId);
  await validateAttempt(exam.id, userId);

  const problems = await examRepository.findExamProblems(exam.id);

  if (problems.length === 0) {
    throw new NotFoundError("No Exam Problems Found");
  }

  return problems;
}

export async function heartbeat(userId: string) {
  await examRepository.touchAttemptHeartbeats(userId);
  return { ok: true };
}

export async function getProblemDescription(problemId: string) {
  const problem = await examRepository.findProblemWithTags(problemId);

  if (!problem) {
    throw new NotFoundError("Problem not found");
  }

  return problem;
}

export async function getSubmissions(params: {
  userId: string;
  attemptId: string;
  problemId: string;
}) {
  const attempt = await examRepository.findAttemptById(params.attemptId);

  if (!attempt) {
    throw new NotFoundError("Exam attempt not found");
  }

  // Ownership check: a student must not read another student's submissions.
  if (attempt.studentId !== params.userId) {
    throw new ForbiddenError("Forbidden");
  }

  const submissions = await examRepository.findAttemptSubmissions(
    params.attemptId,
    params.problemId,
  );

  return { submissions };
}

export async function getTestCases(problemId: string) {
  const testCases = await examRepository.findRunTestCases(problemId);

  if (!testCases) {
    throw new NotFoundError("Test cases not found");
  }

  return {
    ...testCases,
    cases: normalizeProblemTestCases(testCases.cases),
  };
}

export async function getExamDetails(examId: string, userId: string) {
  const exam = await getExamOrThrow(examId, "Exam not found");
  const attempt = await examRepository.findExamAttempt(exam.id, userId);

  return {
    ...exam,
    attempt: attempt
      ? {
          status: attempt.status,
          submittedAt: attempt.submittedAt,
          totalScore: attempt.totalScore,
        }
      : null,
  };
}

export async function startTest(params: {
  userId: string;
  examId: string;
  sebContext: SebRequestContext;
}) {
  const exam = await getExamOrThrow(params.examId);
  const now = new Date();

  if (exam.sebEnabled) {
    verifySEB(params.sebContext);
  }

  await canGiveExamForUser(exam, params.userId);

  const expiresAt = new Date(now.getTime() + exam.durationMin * 60 * 1000);

  return examRepository.upsertAttemptStart({
    examId: exam.id,
    studentId: params.userId,
    expiresAt,
  });
}

export async function submitExamCode(params: {
  userId: string;
  body: ExamRunCodeBody;
  sebContext: SebRequestContext;
}) {
  return submitCodeService({
    examId: params.body.examId,
    problemId: params.body.problemId,
    sourceCode: params.body.sourceCode,
    languageId: params.body.languageId,
    userId: params.userId,
    sebContext: params.sebContext,
  });
}

export async function getSubmissionStatus(params: {
  userId: string;
  submissionId: string;
}) {
  return getExamSubmissionStatusService(params);
}

/**
 * Final exam submission. Attempt state and result row are written atomically.
 */
export async function submitTest(params: {
  userId: string;
  examId: string;
  sebContext: SebRequestContext;
}) {
  const exam = await examRepository.findExamWithProblems(params.examId);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  if (exam.sebEnabled) {
    verifySEB(params.sebContext);
  }

  await canGiveExamForUser(exam, params.userId);

  const attempt = await validateAttempt(exam.id, params.userId);

  const submissions = await examRepository.findExamSubmissionsForStudent({
    examId: exam.id,
    userId: params.userId,
  });

  const hasPendingSubmission = submissions.some(
    (submission) =>
      submission.status === "PENDING" || submission.status === "RUNNING",
  );

  if (hasPendingSubmission) {
    throw new ConflictError(
      "Please wait for all code submissions to finish before final exam submission",
    );
  }

  const totalScore = calculateSubmittedExamScore(
    submissions,
    exam.problems.length,
  );

  const submittedAt = new Date();

  const { attempt: updatedAttempt } = await runInTransaction((tx) =>
    examRepository.persistSubmittedAttempt(tx, {
      attemptId: attempt.id,
      examId: exam.id,
      userId: params.userId,
      totalScore,
      submittedAt,
    }),
  );

  return {
    success: true,
    attemptId: updatedAttempt.id,
    status: updatedAttempt.status,
    submittedAt: updatedAttempt.submittedAt,
    totalScore,
  };
}
