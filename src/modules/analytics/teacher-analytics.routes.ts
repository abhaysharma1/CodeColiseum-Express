import { Router } from "express";
import { requirePermission } from "@/middleware/authorization";
import { validateRequest } from "@/middleware/validation";
import { PERMISSIONS } from "@/permissions/permission.constants";
import {
  getChartData,
  getDashboardSummary,
  getRecentActivity,
  getTopStudents,
} from "./analytics.controller";
import {
  chartDataQuerySchema,
  recentActivityQuerySchema,
  topStudentsQuerySchema,
} from "./analytics.schema";

const router = Router();

router.use(requirePermission(PERMISSIONS.ANALYTICS_VIEW));

router.get("/stats/summary", getDashboardSummary);
router.get(
  "/stats/chart-data",
  validateRequest({ query: chartDataQuerySchema }),
  getChartData,
);
router.get(
  "/recent-activity",
  validateRequest({ query: recentActivityQuerySchema }),
  getRecentActivity,
);
router.get(
  "/top-students",
  validateRequest({ query: topStudentsQuerySchema }),
  getTopStudents,
);

export default router;
