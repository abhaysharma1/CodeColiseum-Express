import { Router } from "express";
import { isTeacher } from "@/middleware/isTeacher.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { PERMISSIONS } from "@/permissions/permission.constants";
import * as marketplaceController from "@/controllers/marketplace.controllers";

const router = Router();

router.use(isTeacher);

// Marketplace browse
router.get(
  "/labs",
  requirePermission(PERMISSIONS.MARKETPLACE_VIEW),
  marketplaceController.getMarketplaceLabs,
);

router.get(
  "/labs/:labId/preview",
  requirePermission(PERMISSIONS.LAB_PREVIEW),
  marketplaceController.getMarketplaceLabPreview,
);

// Duplicate
router.post(
  "/labs/:labId/duplicate",
  requirePermission(PERMISSIONS.LAB_DUPLICATE),
  marketplaceController.duplicateLab,
);

router.get(
  "/labs/:labId/duplicated",
  requirePermission(PERMISSIONS.LAB_VIEW),
  marketplaceController.checkDuplicated,
);

// Ratings
router.post(
  "/labs/:labId/rate",
  requirePermission(PERMISSIONS.LAB_RATE),
  marketplaceController.rateLab,
);

// Tags (for filter dropdown)
router.get(
  "/tags",
  requirePermission(PERMISSIONS.MARKETPLACE_VIEW),
  marketplaceController.getAllTags,
);

export default router;
