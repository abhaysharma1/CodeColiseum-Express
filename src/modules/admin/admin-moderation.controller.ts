import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as moderationService from "./admin-moderation.service";
import type {
  ModerationListQuery,
  RejectProblemInput,
} from "./admin-moderation.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

function listHandler(approvalStatus: "PENDING" | "REJECTED" | "APPROVED") {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = getValidatedQuery<ModerationListQuery>(req);
    const result = await moderationService.listModerationProblems(
      approvalStatus,
      query,
    );
    return res.status(200).json(result);
  });
}

export const getPendingProblems = listHandler("PENDING");
export const getRejectedProblems = listHandler("REJECTED");
export const getApprovedTeacherProblems = listHandler("APPROVED");

export const approveProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { id } = getValidatedParams<{ id: string }>(req);

    const result = await moderationService.approveProblem(id, userId);
    return res.status(200).json(result);
  },
);

export const rejectProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = getValidatedParams<{ id: string }>(req);
    const body = getValidatedBody<RejectProblemInput>(req);

    const result = await moderationService.rejectProblem(id, body);
    return res.status(200).json(result);
  },
);
