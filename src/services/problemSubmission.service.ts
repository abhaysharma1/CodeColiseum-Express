import { Request } from "express";
import prisma from "../utils/prisma";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { sanitizeSourceCode } from "./codeRunner.service";
import {
  fromRuntimeLanguageId,
  getLanguageLabel,
} from "@/utils/languageCatalog";
import { sendPracticeSubmissionToSQS } from "@/utils/sqs";
import { ExecutionStatus } from "../../generated/prisma/enums";
import {
  PollResponse,
  TerminalResponse,
  SubmissionStatusResponse,
} from "@/types/submission.types";

export interface SubmitCodeRequest {
  questionId: string;
  languageId?: number;
  code: string;
}

export interface SubmitCodeQueuedResponse {
  success: boolean;
  submissionId: string;
  status: "PENDING";
}

export interface PracticeSubmissionStatusResponse {
  success: boolean;
  submissionId: string;
  status: ExecutionStatus;
  noOfPassedCases?: number;
  stderr?: string | null;
}

export async function submitCodeService(
  req: Request,
  { questionId, languageId, code }: SubmitCodeRequest,
): Promise<SubmitCodeQueuedResponse> {
  const normalizedLanguage = fromRuntimeLanguageId(languageId);

  if (!normalizedLanguage) {
    const error = new Error("Unsupported language");
    (error as any).status = 400;
    throw error;
  }

  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session?.user?.id) {
    const error = new Error("Unauthorized");
    (error as any).status = 401;
    throw error;
  }

  const problem = await prisma.problem.findUnique({
    where: {
      id: questionId,
    },
  });

  if (!problem) {
    const error = new Error("Couldn't find problem");
    (error as any).status = 400;
    throw error;
  }

  const submission = await prisma.selfSubmission.create({
    data: {
      sourceCode: sanitizeSourceCode(code),
      language: normalizedLanguage,
      passedTestcases: 0,
      userId: session.user.id,
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

export async function getPracticeSubmissionStatusService(
  req: Request,
  submissionId: string,
): Promise<SubmissionStatusResponse> {
  if (!submissionId) {
    const error = new Error("submissionId is required");
    (error as any).status = 400;
    throw error;
  }

  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session?.user?.id) {
    const error = new Error("Unauthorized");
    (error as any).status = 401;
    throw error;
  }

  // Quick check to see current status
  const quickCheck = await prisma.selfSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, userId: true, status: true },
  });

  if (!quickCheck) {
    const error = new Error("Submission not found");
    (error as any).status = 404;
    throw error;
  }

  if (quickCheck.userId !== session.user.id) {
    const error = new Error("Forbidden");
    (error as any).status = 403;
    throw error;
  }

  // Return minimal response while polling
  if (quickCheck.status === "PENDING" || quickCheck.status === "RUNNING") {
    return {
      success: true,
      submissionId: quickCheck.id,
      status: quickCheck.status,
    } as PollResponse;
  }

  // Return complete response when terminal status is reached
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
    },
  });

  if (!submission) {
    const error = new Error("Submission not found");
    (error as any).status = 404;
    throw error;
  }

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
