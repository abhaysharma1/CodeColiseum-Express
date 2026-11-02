import { Router } from "express";
import { requireAuth } from "@/middleware/authentication";
import { validateRequest } from "@/middleware/validation";
import {
  checkPermission,
  getMyPermissions,
} from "./permission.controller";
import { checkPermissionQuerySchema } from "./permission.schema";

const router = Router();

router.use(requireAuth);

router.get(
  "/check",
  validateRequest({ query: checkPermissionQuerySchema }),
  checkPermission,
);
router.get("/me", getMyPermissions);

export default router;
