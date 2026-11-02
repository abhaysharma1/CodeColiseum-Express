import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import { getValidatedQuery } from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as analyticsService from "./analytics.service";
import type {
  OrgStudentsQuery,
  PaginationQuery,
} from "./analytics.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const getOrgAnalyticsOverview = asyncHandler(
  async (_req: Request, res: Response) => {
    const overview = await analyticsService.getOrgOverview();
    return res.status(200).json(overview);
  },
);

export const getOrgAnalyticsGroups = asyncHandler(
  async (req: Request, res: Response) => {
    const query = getValidatedQuery<PaginationQuery>(req);
    const result = await analyticsService.getOrgGroups(query);
    return res.status(200).json(result);
  },
);

export const getOrgAnalyticsStudents = asyncHandler(
  async (req: Request, res: Response) => {
    const query = getValidatedQuery<OrgStudentsQuery>(req);
    const result = await analyticsService.getOrgStudents(query);
    return res.status(200).json(result);
  },
);

export const getOrgAnalyticsExams = asyncHandler(
  async (req: Request, res: Response) => {
    const query = getValidatedQuery<PaginationQuery>(req);
    const result = await analyticsService.getOrgExams(query);
    return res.status(200).json(result);
  },
);

export const getOrgAnalyticsProblems = asyncHandler(
  async (req: Request, res: Response) => {
    const query = getValidatedQuery<PaginationQuery>(req);
    const result = await analyticsService.getOrgProblems(query);
    return res.status(200).json(result);
  },
);

export const getDashboardSummary = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const summary = await analyticsService.getTeacherDashboardSummary(userId);
    return res.status(200).json(summary);
  },
);

export const getChartData = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { days } = getValidatedQuery<{ days: number }>(req);
    const chart = await analyticsService.getTeacherChartData(userId, days);
    return res.status(200).json(chart);
  },
);

export const getRecentActivity = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { limit } = getValidatedQuery<{ limit: number }>(req);
    const activity = await analyticsService.getRecentActivity(userId, limit);
    return res.status(200).json(activity);
  },
);

export const getTopStudents = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { limit } = getValidatedQuery<{ limit: number }>(req);
    const students = await analyticsService.getTopStudents(userId, limit);
    return res.status(200).json(students);
  },
);
