import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getOptionalSessionUser,
} from "@/middleware/authentication";
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from "@/middleware/validation";
import { toSebRequestContext } from "@/utils/exam.utils";
import { UnauthorizedError } from "@/shared/errors";
import * as problemService from "./problem.service";
import type {
  ListProblemsQuery,
  RunCodeBody,
  SubmissionStatusQuery,
  SubmissionsBody,
  TemplateCodeBody,
} from "./problem.schema";

export const getProblemsList = asyncHandler(
  async (req: Request, res: Response) => {
    const user = await getOptionalSessionUser(req);
    const query = getValidatedQuery<ListProblemsQuery>(req);

    const problems = await problemService.listPracticeProblems(
      { id: user?.id, globalRoleId: user?.globalRoleId },
      query,
    );

    return res.status(200).json(problems);
  },
);

export const getProblemTags = asyncHandler(
  async (_req: Request, res: Response) => {
    const tags = await problemService.getProblemTags();
    return res.status(200).json(tags);
  },
);

export const getProblemTestCases = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = getValidatedQuery<{ id: string }>(req);
    const testCases = await problemService.getProblemTestCases(id);
    return res.status(200).json(testCases);
  },
);

export const getProblemDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = getValidatedParams<{ id: string }>(req);
    const problem = await problemService.getProblemDetails(id);
    return res.status(200).json(problem);
  },
);

export const getTemplateCode = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<TemplateCodeBody>(req);
    const template = await problemService.getTemplateCode(body);
    return res.status(200).json(template);
  },
);

export const getSubmissions = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError("Not authenticated");
    }

    const body = getValidatedBody<SubmissionsBody>(req);
    const result = await problemService.getProblemSubmissions(userId, body);

    return res.status(200).json(result);
  },
);

export const runCode = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Login required");
  }

  const body = getValidatedBody<RunCodeBody>(req);

  const result = await problemService.runPracticeCode({
    userId,
    body,
    sebContext: toSebRequestContext(req),
  });

  return res.status(200).json(result);
});

export const submitCode = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError("Login required");
    }

    const body = getValidatedBody<RunCodeBody>(req);

    const result = await problemService.submitPracticeCode({
      userId,
      body,
      sebContext: toSebRequestContext(req),
    });

    return res.status(202).json(result);
  },
);

export const getSubmissionStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError("Login required");
    }

    const { submissionId } = getValidatedParams<{ submissionId: string }>(req);
    const { moduleProblemId } =
      getValidatedQuery<SubmissionStatusQuery>(req);

    const result = await problemService.getSubmissionStatus({
      userId,
      submissionId,
      moduleProblemId,
    });

    return res.status(200).json(result);
  },
);
