import { Router } from "express";
import { validateRequest } from "@/middleware/validation";
import {
  getOrgAnalyticsExams,
  getOrgAnalyticsGroups,
  getOrgAnalyticsOverview,
  getOrgAnalyticsProblems,
  getOrgAnalyticsStudents,
} from "./analytics.controller";
import {
  orgExamsQuerySchema,
  orgGroupsQuerySchema,
  orgProblemsQuerySchema,
  orgStudentsQuerySchema,
} from "./analytics.schema";

const router = Router();

router.get("/overview", getOrgAnalyticsOverview);
router.get(
  "/groups",
  validateRequest({ query: orgGroupsQuerySchema }),
  getOrgAnalyticsGroups,
);
router.get(
  "/students",
  validateRequest({ query: orgStudentsQuerySchema }),
  getOrgAnalyticsStudents,
);
router.get(
  "/exams",
  validateRequest({ query: orgExamsQuerySchema }),
  getOrgAnalyticsExams,
);
router.get(
  "/problems",
  validateRequest({ query: orgProblemsQuerySchema }),
  getOrgAnalyticsProblems,
);

export default router;
