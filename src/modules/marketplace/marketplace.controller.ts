import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import { getValidatedBody, getValidatedParams, getValidatedQuery } from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as marketplaceService from "./marketplace.service";
import type {
  MarketplaceQuery,
  PublishLabInput,
  RateLabInput,
} from "./marketplace.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const getMarketplaceLabs = asyncHandler(
  async (req: Request, res: Response) => {
    const query = getValidatedQuery<MarketplaceQuery>(req);
    const result = await marketplaceService.getPublicLabs(query);
    return res.status(200).json(result);
  },
);

export const getMarketplaceLabPreview = asyncHandler(
  async (req: Request, res: Response) => {
    const { labId } = getValidatedParams<{ labId: string }>(req);
    const preview = await marketplaceService.getPublicLabPreview(labId);
    return res.status(200).json(preview);
  },
);

export const publishLab = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);
    getValidatedBody<PublishLabInput>(req);

    const lab = await marketplaceService.publishLab(userId, labId);
    return res.status(200).json(lab);
  },
);

export const unpublishLab = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const lab = await marketplaceService.unpublishLab(userId, labId);
    return res.status(200).json(lab);
  },
);

export const duplicateLab = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const newLab = await marketplaceService.duplicateLab(userId, labId);
    return res.status(201).json(newLab);
  },
);

export const checkDuplicated = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const duplicate = await marketplaceService.getUserDuplicate(userId, labId);

    return res.status(200).json({
      hasDuplicated: Boolean(duplicate),
      duplicate: duplicate ?? undefined,
    });
  },
);

export const rateLab = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { labId } = getValidatedParams<{ labId: string }>(req);
  const { score, review } = getValidatedBody<RateLabInput>(req);

  const result = await marketplaceService.rateLab(userId, labId, score, review);
  return res.status(200).json(result);
});

export const getAllTags = asyncHandler(
  async (_req: Request, res: Response) => {
    const tags = await marketplaceService.getAllTags();
    return res.status(200).json(tags);
  },
);
