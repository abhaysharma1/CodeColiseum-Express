import prisma from "@/infrastructure/database/prisma";
import { sanitizeSourceCode } from "./codeExecutor.service";
import { fromRuntimeLanguageId } from "@/utils/languageCatalog";
import { sendPracticeSubmissionToSQS } from "@/utils/sqs";
import { ExecutionStatus } from "../../generated/prisma/enums";
import {
  PollResponse,
  TerminalResponse,
  SubmissionStatusResponse,
} from "@/types/submission.types";
import { upsertModuleProblemProgress } from "@/modules/labs/lab.service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";

export interface SubmitCodeRequest {
  userId: string;
  questionId: string;
  languageId?: number;
  code: string;
  moduleProblemId?: string;
}

export interface SubmitCodeQueuedResponse {
  success: boolean;
  submissionId: string;
  status: "PENDING";
}

export interface PracticeSubmissionStatusInput {
  userId: string;
  submissionId: string;
  moduleProblemId?: string;
}

export interface PracticeSubmissionStatusResponse {
  success: boolean;
  submissionId: string;
  status: ExecutionStatus;
  noOfPassedCases?: number;
  stderr?: string | null;
}

export async function submitCodeService({
  userId,
  questionId,
  languageId,
  code,
  moduleProblemId: _moduleProblemId,
}: SubmitCodeRequest): Promise<SubmitCodeQueuedResponse> {
  const normalizedLanguage = fromRuntimeLanguageId(languageId);

  if (!normalizedLanguage) {
    throw new ValidationError("Unsupported language");
  }

  const problem = await prisma.problem.findUnique({
    where: { id: questionId },
  });

  if (!problem) {
    throw new ValidationError("Couldn't find problem");
  }

  const submission = await prisma.selfSubmission.create({
    data: {
      sourceCode: sanitizeSourceCode(code),
      language: normalizedLanguage,
      passedTestcases: 0,
      userId,
      problemId: questionId,
      status: "PENDING",
    },
  });

  await sendPracticeSubmissionToSQS(submission.id);

  return {
    success: true,
    submissionId: submission.id,
    status: "PENDING",
  };
}

export async function getPracticeSubmissionStatusService({
  userId,
  submissionId,
  moduleProblemId,
}: PracticeSubmissionStatusInput): Promise<SubmissionStatusResponse> {
  if (!submissionId) {
    throw new ValidationError("submissionId is required");
  }

  const quickCheck = await prisma.selfSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, userId: true, status: true },
  });

  if (!quickCheck) {
    throw new NotFoundError("Submission not found");
  }

  if (quickCheck.userId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  // Return minimal response while polling.
  if (quickCheck.status === "PENDING" || quickCheck.status === "RUNNING") {
    return {
      success: true,
      submissionId: quickCheck.id,
      status: quickCheck.status,
    } as PollResponse;
  }

  const submission = await prisma.selfSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      sourceCode: true,
      language: true,
      status: true,
      passedTestcases: true,
      totalTestcases: true,
      executionTime: true,
      memory: true,
      stderr: true,
      createdAt: true,
      userId: true,
      problemId: true,
    },
  });

  if (!submission) {
    throw new NotFoundError("Submission not found");
  }

  // Module progress is a side effect and must not block the poll response.
  void upsertModuleProblemProgress(
    submission.userId,
    submission.id,
    submission.status,
    moduleProblemId,
  ).catch(() => undefined);

  return {
    success: true,
    submissionId: submission.id,
    sourceCode: submission.sourceCode,
    language: submission.language,
    status: submission.status as ExecutionStatus,
    passedTestcases: submission.passedTestcases,
    totalTestcases: submission.totalTestcases,
    executionTime: submission.executionTime ?? undefined,
    memory: submission.memory ?? undefined,
    stderr: submission.stderr,
    createdAt: submission.createdAt,
  } as TerminalResponse;
}
