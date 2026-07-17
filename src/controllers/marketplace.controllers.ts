import { NextFunction, Request, Response } from "express";
import { marketplaceQuerySchema, publishLabSchema, rateLabSchema } from "@/validations/marketplace.schema";
import * as marketplaceService from "@/services/marketplace.service";

export const getMarketplaceLabs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const parsed = marketplaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const tagIds = req.query.tagIds
      ? String(req.query.tagIds).split(",").filter(Boolean)
      : undefined;
    const query = { ...parsed.data, tagIds };

    const result = await marketplaceService.getPublicLabs(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getMarketplaceLabPreview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const labId = req.params.labId as string;
    const preview = await marketplaceService.getPublicLabPreview(labId);
    res.status(200).json(preview);
  } catch (error) {
    next(error);
  }
};

export const publishLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const parsed = publishLabSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message ?? "Confirmation required",
      });
    }

    const lab = await marketplaceService.publishLab(user.id, labId);
    res.status(200).json(lab);
  } catch (error) {
    next(error);
  }
};

export const unpublishLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const lab = await marketplaceService.unpublishLab(user.id, labId);
    res.status(200).json(lab);
  } catch (error) {
    next(error);
  }
};

export const duplicateLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const newLab = await marketplaceService.duplicateLab(user.id, labId);
    res.status(201).json(newLab);
  } catch (error) {
    next(error);
  }
};

export const checkDuplicated = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const duplicate = await marketplaceService.getUserDuplicate(user.id, labId);
    const hasDuplicated = !!duplicate;

    res.status(200).json({
      hasDuplicated,
      duplicate: duplicate ?? undefined,
    });
  } catch (error) {
    next(error);
  }
};

export const rateLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const parsed = rateLabSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await marketplaceService.rateLab(
      user.id,
      labId,
      parsed.data.score,
      parsed.data.review,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getLabAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const analytics = await marketplaceService.getLabAnalytics(user.id, labId);
    res.status(200).json(analytics);
  } catch (error) {
    next(error);
  }
};

export const getAllTags = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tags = await marketplaceService.getAllTags();
    res.status(200).json(tags);
  } catch (error) {
    next(error);
  }
};
