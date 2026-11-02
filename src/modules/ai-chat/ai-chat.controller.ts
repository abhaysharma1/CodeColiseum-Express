import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import { getValidatedBody, getValidatedQuery } from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as aiChatService from "./ai-chat.service";
import type { ExamChatBody, LabChatBody } from "./ai-chat.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const isAiEnabledAndGetGroupId = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);

    const availability = await aiChatService.getExamAiAvailability(
      userId,
      examId,
    );

    return res.status(200).json(availability);
  },
);

export const chatWithAi = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<ExamChatBody>(req);

    const result = await aiChatService.chatWithExamAi({ userId, body });
    return res.status(201).json(result);
  },
);

export const getAiChatStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId, problemId } =
      getValidatedQuery<{ examId: string; problemId: string }>(req);

    const result = await aiChatService.getExamAiStatus({
      userId,
      examId,
      problemId,
    });

    return res.status(200).json(result);
  },
);

export const isLabAiEnabled = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleProblemId } =
      getValidatedQuery<{ moduleProblemId: string }>(req);

    const availability = await aiChatService.getLabAiAvailability(
      userId,
      moduleProblemId,
    );

    if (availability.outcome === "NOT_FOUND") {
      return res.status(404).json({ enabled: false });
    }

    if (availability.outcome === "FORBIDDEN") {
      return res.status(403).json({ enabled: false });
    }

    return res.status(200).json({
      enabled: availability.enabled,
      labId: availability.labId,
      aiMaxMessages: availability.aiMaxMessages,
      aiMaxTokens: availability.aiMaxTokens,
    });
  },
);

export const labChatWithAi = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<LabChatBody>(req);

    const result = await aiChatService.chatWithLabAi({ userId, body });
    return res.status(201).json(result);
  },
);

export const getLabAiChatStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId, problemId } =
      getValidatedQuery<{ labId: string; problemId: string }>(req);

    const result = await aiChatService.getLabAiStatus({
      userId,
      labId,
      problemId,
    });

    return res.status(200).json(result);
  },
);
