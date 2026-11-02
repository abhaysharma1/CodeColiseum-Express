import prisma from "@/infrastructure/database/prisma";
import {
  canGiveExamForUser,
  sanitizeSourceCode,
  validateAttempt,
  verifySEB,
  type SebRequestContext,
} from "@/utils/exam.utils";
import { ExecutionStatus } from "../../generated/prisma/enums";
import { fromRuntimeLanguageId, getLanguageLabel } from "@/utils/languageCatalog";
import { sendExamSubmissionToSQS } from "@/utils/sqs";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";

export interface SubmitCodeRequest {
  examId: string;
  problemId: string;
  sourceCode: string;
  languageId: number;
  userId: string;
  sebContext: SebRequestContext;
}

export interface SubmitCodeResponse {
  success: boolean;
  submissionId: string;
  status: ExecutionStatus;
}

export interface ExamSubmissionStatusResponse {
  success: boolean;
  submissionId: string;
  status: ExecutionStatus;
  passedCount?: number;
  totalCount?: number;
  score?: number;
  stderr?: string | null;
  executionTime?: number | null;
  memory?: number | null;
}

export interface ExamSubmissionStatusInput {
  submissionId: string;
  userId: string;
}

function calculateScore(
  passedTestcases: number,
  totalTestcases: number,
): number {
  if (!totalTestcases) {
    return 0;
  }

  return Math.round((passedTestcases / totalTestcases) * 100);
}

export async function submitCodeService({
  examId,
  problemId,
  sourceCode,
  languageId,
  userId,
  sebContext,
}: SubmitCodeRequest): Promise<SubmitCodeResponse> {
  if (!examId || !problemId || !sourceCode || !languageId) {
    throw new ValidationError("Missing required fields");
  }

  const normalizedLanguage = fromRuntimeLanguageId(languageId);
  const languageLabel = normalizedLanguage
    ? getLanguageLabel(normalizedLanguage)
    : null;

  if (!normalizedLanguage || !languageLabel) {
    throw new ValidationError("Unsupported language");
  }

  const examDetails = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!examDetails) {
    throw new NotFoundError("Exam Not Found");
  }

  if (examDetails.sebEnabled) {
    verifySEB(sebContext);
  }

  await canGiveExamForUser(examDetails, userId);
  await validateAttempt(examDetails.id, userId);

  const examAttempt = await prisma.examAttempt.findUnique({
    where: {
      examId_studentId: {
        examId: examDetails.id,
        studentId: userId,
      },
    },
  });

  if (!examAttempt) {
    throw new NotFoundError("Exam attempt not found");
  }

  const submission = await prisma.submission.create({
    data: {
      attemptId: examAttempt.id,
      problemId,
      language: normalizedLanguage,
      sourceCode: sanitizeSourceCode(sourceCode),
      status: ExecutionStatus.PENDING,
      examId,
      userId,
      isFinal: false,
    },
  });

  await sendExamSubmissionToSQS(submission.id);

  return {
    success: true,
    submissionId: submission.id,
    status: ExecutionStatus.PENDING,
  };
}

export async function getExamSubmissionStatusService({
  submissionId,
  userId,
}: ExamSubmissionStatusInput): Promise<ExamSubmissionStatusResponse> {
  if (!submissionId) {
    throw new ValidationError("submissionId is required");
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      userId: true,
      status: true,
      passedTestcases: true,
      totalTestcases: true,
      executionTime: true,
      memory: true,
      stderr: true,
      problemId: true,
    },
  });

  if (!submission) {
    throw new NotFoundError("Submission not found");
  }

  if (submission.userId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  const score = calculateScore(
    submission.passedTestcases,
    submission.totalTestcases,
  );

  return {
    success: true,
    submissionId: submission.id,
    status: submission.status,
    passedCount: submission.passedTestcases,
    totalCount: submission.totalTestcases,
    score,
    stderr: submission.stderr,
    executionTime: submission.executionTime,
    memory: submission.memory,
  };
}
