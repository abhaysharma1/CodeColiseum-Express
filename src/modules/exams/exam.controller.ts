import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from "@/middleware/validation";
import { toSebRequestContext } from "@/utils/exam.utils";
import { UnauthorizedError } from "@/shared/errors";
import * as examService from "./exam.service";
import type {
  ExamRunCodeBody,
  ExamSubmissionsQuery,
} from "./exam.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const runCode = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const body = getValidatedBody<ExamRunCodeBody>(req);

  const result = await examService.runExamCode({
    userId,
    body,
    sebContext: toSebRequestContext(req),
  });

  return res.status(200).json(result);
});

export const getTestProblems = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedBody<{ examId: string }>(req);

    const problems = await examService.getTestProblems(examId, userId);
    return res.status(200).json(problems);
  },
);

export const heartbeat = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const result = await examService.heartbeat(userId);
    return res.status(200).json(result);
  },
);

export const getProblemDescription = asyncHandler(
  async (req: Request, res: Response) => {
    const { problemId } = getValidatedQuery<{ problemId: string }>(req);
    const problem = await examService.getProblemDescription(problemId);
    return res.status(200).json(problem);
  },
);

export const getSubmissions = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { attemptId, problemId } =
      getValidatedQuery<ExamSubmissionsQuery>(req);

    const result = await examService.getSubmissions({
      userId,
      attemptId,
      problemId,
    });

    return res.status(200).json(result);
  },
);

export const getTestCases = asyncHandler(
  async (req: Request, res: Response) => {
    const { questionId } = getValidatedQuery<{ questionId: string }>(req);
    const testCases = await examService.getTestCases(questionId);
    return res.status(200).json(testCases);
  },
);

export const getExamDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);

    const details = await examService.getExamDetails(examId, userId);
    return res.status(200).json(details);
  },
);

export const startTest = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedBody<{ examId: string }>(req);

    const attempt = await examService.startTest({
      userId,
      examId,
      sebContext: toSebRequestContext(req),
    });

    return res.status(201).json(attempt);
  },
);

export const submitCode = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<ExamRunCodeBody>(req);

    const result = await examService.submitExamCode({
      userId,
      body,
      sebContext: toSebRequestContext(req),
    });

    return res.status(202).json(result);
  },
);

export const getSubmissionStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { submissionId } = getValidatedParams<{ submissionId: string }>(req);

    const result = await examService.getSubmissionStatus({
      userId,
      submissionId,
    });

    return res.status(200).json(result);
  },
);

export const submitTest = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedBody<{ examId: string }>(req);

    const result = await examService.submitTest({
      userId,
      examId,
      sebContext: toSebRequestContext(req),
    });

    return res.status(200).json(result);
  },
);
