import { Router } from "express";
import { requireCronSecret } from "@/middleware/cron-auth";
import { validateRequest } from "@/middleware/validation";
import {
  finalizeExams,
  recomputeAnalytics,
} from "./internal.controller";
import { recomputeAnalyticsBodySchema } from "./internal.schema";

const router = Router();

router.use(requireCronSecret);

router.post("/exams/finalize", finalizeExams);

router.post(
  "/analytics/recompute",
  validateRequest({ body: recomputeAnalyticsBodySchema }),
  recomputeAnalytics,
);

export default router;
