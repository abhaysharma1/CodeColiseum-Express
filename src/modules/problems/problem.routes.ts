import { Router } from "express";
import { requireAuth } from "@/middleware/authentication";
import { validateRequest } from "@/middleware/validation";
import {
  getProblemDetails,
  getProblemTags,
  getProblemTestCases,
  getProblemsList,
  getSubmissionStatus,
  getSubmissions,
  getTemplateCode,
  runCode,
  submitCode,
} from "./problem.controller";
import {
  listProblemsQuerySchema,
  problemIdParamSchema,
  runCodeBodySchema,
  submissionStatusParamsSchema,
  submissionStatusQuerySchema,
  submissionsBodySchema,
  templateCodeBodySchema,
  testCasesQuerySchema,
} from "./problem.schema";

const router = Router();

// Public practice catalogue
router.get(
  "/getproblems",
  validateRequest({ query: listProblemsQuerySchema }),
  getProblemsList,
);
router.get("/gettags", getProblemTags);
router.get(
  "/gettestcases",
  validateRequest({ query: testCasesQuerySchema }),
  getProblemTestCases,
);
router.get(
  "/:id",
  validateRequest({ params: problemIdParamSchema }),
  getProblemDetails,
);
router.post(
  "/gettemplatecode",
  validateRequest({ body: templateCodeBodySchema }),
  getTemplateCode,
);

// Authenticated practice operations
router.use(requireAuth);

router.post(
  "/getsubmissions",
  validateRequest({ body: submissionsBodySchema }),
  getSubmissions,
);
router.post(
  "/runcode",
  validateRequest({ body: runCodeBodySchema }),
  runCode,
);
router.post(
  "/submitcode",
  validateRequest({ body: runCodeBodySchema }),
  submitCode,
);
router.get(
  "/submission-status/:submissionId",
  validateRequest({
    params: submissionStatusParamsSchema,
    query: submissionStatusQuerySchema,
  }),
  getSubmissionStatus,
);

export default router;
