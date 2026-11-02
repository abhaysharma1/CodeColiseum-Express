import { Router } from "express";
import { requireTeacher } from "@/middleware/authentication";
import { requirePermission } from "@/middleware/authorization";
import { validateRequest } from "@/middleware/validation";
import { PERMISSIONS } from "@/permissions/permission.constants";
import * as marketplaceController from "./marketplace.controller";
import {
  labIdParamSchema,
  marketplaceQuerySchema,
  rateLabSchema,
} from "./marketplace.schema";

const router = Router();

router.use(requireTeacher);

// Marketplace browse
router.get(
  "/labs",
  requirePermission(PERMISSIONS.MARKETPLACE_VIEW),
  validateRequest({ query: marketplaceQuerySchema }),
  marketplaceController.getMarketplaceLabs,
);

router.get(
  "/labs/:labId/preview",
  requirePermission(PERMISSIONS.LAB_PREVIEW),
  validateRequest({ params: labIdParamSchema }),
  marketplaceController.getMarketplaceLabPreview,
);

// Duplicate
router.post(
  "/labs/:labId/duplicate",
  requirePermission(PERMISSIONS.LAB_DUPLICATE),
  validateRequest({ params: labIdParamSchema }),
  marketplaceController.duplicateLab,
);

router.get(
  "/labs/:labId/duplicated",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: labIdParamSchema }),
  marketplaceController.checkDuplicated,
);

// Ratings
router.post(
  "/labs/:labId/rate",
  requirePermission(PERMISSIONS.LAB_RATE),
  validateRequest({ params: labIdParamSchema, body: rateLabSchema }),
  marketplaceController.rateLab,
);

// Tags (for filter dropdown)
router.get(
  "/tags",
  requirePermission(PERMISSIONS.MARKETPLACE_VIEW),
  marketplaceController.getAllTags,
);

export default router;
