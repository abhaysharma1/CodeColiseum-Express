import { Router } from "express";
import { validateRequest } from "@/middleware/validation";
import { examAiRouter } from "@/modules/ai-chat";
import {
  getExamDetails,
  getProblemDescription,
  getSubmissionStatus,
  getSubmissions,
  getTestCases,
  getTestProblems,
  heartbeat,
  runCode,
  startTest,
  submitCode,
  submitTest,
} from "./exam.controller";
import {
  examIdBodySchema,
  examIdQuerySchema,
  examRunCodeBodySchema,
  examSubmissionsQuerySchema,
  problemDescriptionQuerySchema,
  submissionStatusParamsSchema,
  testCasesQuerySchema,
} from "./exam.schema";

const router = Router();

// GET routes
router.get(
  "/problem-description",
  validateRequest({ query: problemDescriptionQuerySchema }),
  getProblemDescription,
);
router.get(
  "/submissions",
  validateRequest({ query: examSubmissionsQuerySchema }),
  getSubmissions,
);
router.get(
  "/submission-status/:submissionId",
  validateRequest({ params: submissionStatusParamsSchema }),
  getSubmissionStatus,
);
router.get(
  "/test-cases",
  validateRequest({ query: testCasesQuerySchema }),
  getTestCases,
);
router.get(
  "/exam-details",
  validateRequest({ query: examIdQuerySchema }),
  getExamDetails,
);

// POST routes
router.post(
  "/test-problems",
  validateRequest({ body: examIdBodySchema }),
  getTestProblems,
);
router.post("/heartbeat", heartbeat);
router.post(
  "/start-test",
  validateRequest({ body: examIdBodySchema }),
  startTest,
);
router.post(
  "/runcode",
  validateRequest({ body: examRunCodeBodySchema }),
  runCode,
);
router.post(
  "/submit-code",
  validateRequest({ body: examRunCodeBodySchema }),
  submitCode,
);
router.post(
  "/submit-test",
  validateRequest({ body: examIdBodySchema }),
  submitTest,
);

// AI assist
router.use("/ai", examAiRouter);

export default router;
