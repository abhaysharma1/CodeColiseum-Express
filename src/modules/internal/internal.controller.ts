import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import { getValidatedBody } from "@/middleware/validation";
import {
  finalizeExpiredExams,
  recomputeAnalytics as recomputeAnalyticsService,
} from "./internal.service";
import type { RecomputeAnalyticsInput } from "./internal.schema";

export const finalizeExams = asyncHandler(
  async (_req: Request, res: Response) => {
    const result = await finalizeExpiredExams();
    return res.status(200).json(result);
  },
);

export const recomputeAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const input = getValidatedBody<RecomputeAnalyticsInput>(req);
    const result = await recomputeAnalyticsService(input);
    return res.status(200).json(result);
  },
);
