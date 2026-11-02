import { Router } from "express";
import { requirePermission } from "@/middleware/authorization";
import { validateRequest } from "@/middleware/validation";
import { PERMISSIONS } from "@/permissions/permission.constants";
import {
  exportAnalyticsCSV,
  exportAnalyticsPDF,
  getAnalyticsCharts,
  getAnalyticsExamDetails,
  getAnalyticsExams,
  getAnalyticsOverview,
  getAnalyticsProblemDetails,
  getAnalyticsProblemStudents,
  getAnalyticsProblems,
  getAnalyticsStudents,
  getGroupOverallStats,
  getGroupProblemStats,
  getStudentDetailedAnalytics,
  getStudentOverallStats,
  getStudentProblemStats,
} from "./group-analytics.controller";
import {
  analyticsChartsQuerySchema,
  analyticsExamsQuerySchema,
  analyticsExportQuerySchema,
  analyticsOverviewQuerySchema,
  analyticsProblemStudentsQuerySchema,
  analyticsProblemsQuerySchema,
  analyticsStudentsQuerySchema,
  examDetailsParamsSchema,
  groupProblemsQuerySchema,
  groupStatsQuerySchema,
  problemDetailsParamsSchema,
  studentDetailsParamsSchema,
  studentProblemStatsQuerySchema,
} from "./group-analytics.schema";

const router = Router();

const getGroupIdFromQuery = (req: {
  query: { groupId?: unknown };
}): string | undefined =>
  typeof req.query.groupId === "string" ? req.query.groupId : undefined;

router.use(
  requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
);

router.get(
  "/group-overall-stats",
  validateRequest({ query: groupStatsQuerySchema }),
  getGroupOverallStats,
);
router.get(
  "/group-problem-stats",
  validateRequest({ query: groupProblemsQuerySchema }),
  getGroupProblemStats,
);
router.get(
  "/student-overall-stats",
  validateRequest({ query: groupStatsQuerySchema }),
  getStudentOverallStats,
);
router.get(
  "/student-problem-stats",
  validateRequest({ query: studentProblemStatsQuerySchema }),
  getStudentProblemStats,
);

router.get(
  "/analytics/students",
  validateRequest({ query: analyticsStudentsQuerySchema }),
  getAnalyticsStudents,
);
router.get(
  "/analytics/students/:studentId/details",
  validateRequest({
    params: studentDetailsParamsSchema,
    query: analyticsOverviewQuerySchema,
  }),
  getStudentDetailedAnalytics,
);
router.get(
  "/analytics/overview",
  validateRequest({ query: analyticsOverviewQuerySchema }),
  getAnalyticsOverview,
);
router.get(
  "/analytics/charts",
  validateRequest({ query: analyticsChartsQuerySchema }),
  getAnalyticsCharts,
);
router.get(
  "/analytics/problems",
  validateRequest({ query: analyticsProblemsQuerySchema }),
  getAnalyticsProblems,
);
router.get(
  "/analytics/problems/:problemId/details",
  validateRequest({
    params: problemDetailsParamsSchema,
    query: analyticsOverviewQuerySchema,
  }),
  getAnalyticsProblemDetails,
);
router.get(
  "/analytics/problems/:problemId/students",
  validateRequest({
    params: problemDetailsParamsSchema,
    query: analyticsProblemStudentsQuerySchema,
  }),
  getAnalyticsProblemStudents,
);
router.get(
  "/analytics/exams",
  validateRequest({ query: analyticsExamsQuerySchema }),
  getAnalyticsExams,
);
router.get(
  "/analytics/exams/:examId/details",
  validateRequest({
    params: examDetailsParamsSchema,
    query: analyticsOverviewQuerySchema,
  }),
  getAnalyticsExamDetails,
);
router.get(
  "/analytics/export-csv",
  validateRequest({ query: analyticsExportQuerySchema }),
  exportAnalyticsCSV,
);
router.get(
  "/analytics/export-pdf",
  validateRequest({ query: analyticsExportQuerySchema }),
  exportAnalyticsPDF,
);

export default router;
