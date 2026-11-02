import { Router } from "express";
import { validateRequest } from "@/middleware/validation";
import {
  approveProblem,
  getApprovedTeacherProblems,
  getPendingProblems,
  getRejectedProblems,
  rejectProblem,
} from "./admin-moderation.controller";
import {
  moderationListQuerySchema,
  moderationProblemParamSchema,
  rejectProblemSchema,
} from "./admin-moderation.schema";

const router = Router();

// Listing routes must stay before `/:id` matching in the legacy admin router.
router.get(
  "/pending",
  validateRequest({ query: moderationListQuerySchema }),
  getPendingProblems,
);
router.get(
  "/rejected",
  validateRequest({ query: moderationListQuerySchema }),
  getRejectedProblems,
);
router.get(
  "/approved",
  validateRequest({ query: moderationListQuerySchema }),
  getApprovedTeacherProblems,
);

router.post(
  "/:id/approve",
  validateRequest({ params: moderationProblemParamSchema }),
  approveProblem,
);
router.post(
  "/:id/reject",
  validateRequest({
    params: moderationProblemParamSchema,
    body: rejectProblemSchema,
  }),
  rejectProblem,
);

export default router;
