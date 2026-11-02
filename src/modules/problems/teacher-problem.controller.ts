import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as teacherProblemService from "./teacher-problem.service";
import type {
  CreateTeacherProblemInput,
  MyProblemsQuery,
  RunReferenceSolutionInput,
  UpdateTeacherProblemInput,
} from "./teacher-problem.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const createTeacherProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<CreateTeacherProblemInput>(req);

    const result = await teacherProblemService.createProblem(userId, body);
    return res.status(201).json(result);
  },
);

export const getMyProblems = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<MyProblemsQuery>(req);

    const result = await teacherProblemService.listMyProblems(userId, query);
    return res.status(200).json(result);
  },
);

export const getTeacherProblemForEditor = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = getValidatedParams<{ id: string }>(req);

    const problem = await teacherProblemService.getProblemForEditor(userId, id);
    return res.status(200).json(problem);
  },
);

export const updateTeacherProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = getValidatedParams<{ id: string }>(req);
    const body = getValidatedBody<UpdateTeacherProblemInput>(req);

    const result = await teacherProblemService.updateProblem(userId, id, body);
    return res.status(200).json(result);
  },
);

export const deleteTeacherProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = getValidatedParams<{ id: string }>(req);

    const result = await teacherProblemService.deleteProblem(userId, id);
    return res.status(200).json(result);
  },
);

export const resubmitProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = getValidatedParams<{ id: string }>(req);

    const result = await teacherProblemService.resubmitProblem(userId, id);
    return res.status(200).json(result);
  },
);

export const runTeacherReferenceSolution = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<RunReferenceSolutionInput>(req);

    const result = await teacherProblemService.runReferenceSolution(body);
    return res.status(200).json(result);
  },
);
