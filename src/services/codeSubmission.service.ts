import { Request } from "express";
import prisma from "../utils/prisma";
import {
  canGiveExam,
  sanitizeSourceCode,
  validateAttempt,
  verifySEB,
} from "../utils/exam.utils";
import { ExecutionStatus } from "../../generated/prisma/enums";
import { fromRuntimeLanguageId, getLanguageLabel } from "@/utils/languageCatalog";
import { sendExamSubmissionToSQS } from "@/utils/sqs";

export interface SubmitCodeRequest {
  examId: string;
  problemId: string;
  sourceCode: string;
  languageId: number;
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

function calculateScore(passedTestcases: number, totalTestcases: number): number {
  if (!totalTestcases) {
    return 0;
  }

  return Math.round((passedTestcases / totalTestcases) * 100);
}

export async function submitCodeService(
  req: Request,
  { examId, problemId, sourceCode, languageId }: SubmitCodeRequest,
): Promise<SubmitCodeResponse> {
  if (!examId || !problemId || !sourceCode || !languageId) {
    throw new Error("Missing required fields");
  }

  const normalizedLanguage = fromRuntimeLanguageId(languageId);
  const languageLabel = normalizedLanguage
    ? getLanguageLabel(normalizedLanguage)
    : null;

  if (!normalizedLanguage || !languageLabel) {
    throw new Error("Unsupported language");
  }

  const examDetails = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!examDetails) {
    throw new Error("Exam Not Found");
  }

  if (examDetails.sebEnabled) {
    verifySEB(req);
  }

  const session = await canGiveExam(examDetails, req);
  await validateAttempt(examDetails.id, session.user.id);

  const examAttempt = await prisma.examAttempt.findUnique({
    where: {
      examId_studentId: {
        examId: examDetails.id,
        studentId: session.user.id,
      },
    },
  });

  if (!examAttempt) {
    throw new Error("Exam attempt not found");
  }

  const submission = await prisma.submission.create({
    data: {
      attemptId: examAttempt.id,
      problemId,
      language: languageLabel,
      sourceCode: sanitizeSourceCode(sourceCode),
      status: ExecutionStatus.PENDING,
      examId,
      userId: session.user.id,
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

export async function getExamSubmissionStatusService(
  req: Request,
  submissionId: string,
): Promise<ExamSubmissionStatusResponse> {
  if (!submissionId) {
    throw new Error("submissionId is required");
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
    },
  });

  if (!submission) {
    const error = new Error("Submission not found");
    (error as any).status = 404;
    throw error;
  }

  if (!req.user || submission.userId !== req.user.id) {
    const error = new Error("Forbidden");
    (error as any).status = 403;
    throw error;
  }

  const score = calculateScore(submission.passedTestcases, submission.totalTestcases);

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
