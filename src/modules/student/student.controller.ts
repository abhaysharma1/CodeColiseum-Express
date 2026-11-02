import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import { getValidatedQuery } from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as studentService from "./student.service";
import type {
  GroupExamsQuery,
  StudentGroupsQuery,
} from "./student.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const getDashboardData = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = await studentService.getDashboardData(userId);
    return res.status(200).json(data);
  },
);

export const getAllGroups = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<StudentGroupsQuery>(req);
    const groups = await studentService.listGroups(userId, query);
    return res.status(200).json(groups);
  },
);

export const getGroupData = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);
    const group = await studentService.getGroupData(userId, groupId);
    return res.status(200).json(group);
  },
);

export const getGroupExams = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<GroupExamsQuery>(req);
    const exams = await studentService.getGroupExams(userId, query);
    return res.status(200).json(exams);
  },
);

export const getGroupCreator = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);
    const creator = await studentService.getGroupCreator(userId, groupId);
    return res.status(200).json(creator);
  },
);

export const getExamResult = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);
    const result = await studentService.getExamResult(userId, examId);
    return res.status(200).json(result);
  },
);

export const getExamAIResult = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);
    const result = await studentService.getExamAIResult(userId, examId);
    return res.status(200).json(result);
  },
);
