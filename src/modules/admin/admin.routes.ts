import { Router } from "express";
import { isAdmin } from "@/middleware/isAdmin.middleware";
import { validateRequest } from "@/middleware/validation";
import {
  adminSingleSignUp,
  assignUserRoleByEmail,
  bulkSignUp,
  bulkSignupUploadCsv,
  bulkStudentSignUp,
  bulkTeacherSignUp,
  createCollege,
  createPerformanceTestCase,
  createUpdatePerformanceConstraints,
  deletePerformanceConstraints,
  deletePerformanceTestCase,
  getColleges,
  getPerformanceConstraints,
  getPerformanceTestCases,
  getProblemForEditor,
  getProblemsForAdmin,
  resetUserPasswordByEmail,
  runReferenceSolution,
  runtimeAnalyzer,
  sendCredentialsEmail,
  toggleProblemHidden,
  toggleProblemPublish,
  uploadDriverCode,
  uploadProblems,
  upsertProblem,
  validateComplexityCases,
  validateProblem,
} from "./admin.controller";
import {
  adminAssignRoleSchema,
  adminProblemsQuerySchema,
  adminResetPasswordSchema,
  adminSingleSignUpSchema,
  bulkSignUpSchema,
  bulkSignupCsvSchema,
  bulkSignupMetaSchema,
  createCollegeSchema,
  createPerformanceTestCaseSchema,
  driverCodeSchema,
  performanceConstraintsSchema,
  performanceTestCaseParamSchema,
  problemEditorSchema,
  problemIdParamSchema,
  problemIdQuerySchema,
  runReferenceSolutionSchema,
  runtimeAnalyzerParamSchema,
  runtimeAnalyzerSchema,
  toggleHiddenSchema,
  togglePublishSchema,
  uploadProblemsSchema,
  validateComplexitySchema,
} from "./admin.schema";
import {
  performanceTestCaseUpload,
  singleExcelUpload,
} from "./admin.upload";
import adminModerationRouter from "./admin-moderation.routes";
import { adminAnalyticsRouter } from "@/modules/analytics";

const router = Router();

// Apply admin middleware to all routes
router.use(isAdmin);

// Driver Code Routes
router.post(
  "/driver-code",
  validateRequest({ body: driverCodeSchema }),
  uploadDriverCode,
);

// Performance Constraints Routes
router.get(
  "/performance-constraints",
  validateRequest({ query: problemIdQuerySchema }),
  getPerformanceConstraints,
);
router.post(
  "/performance-constraints",
  validateRequest({ body: performanceConstraintsSchema }),
  createUpdatePerformanceConstraints,
);
router.delete(
  "/performance-constraints",
  validateRequest({ query: problemIdQuerySchema }),
  deletePerformanceConstraints,
);

// Performance Test Cases Routes
router.get(
  "/performance-test-cases",
  validateRequest({ query: problemIdQuerySchema }),
  getPerformanceTestCases,
);
router.post(
  "/performance-test-cases",
  performanceTestCaseUpload,
  validateRequest({ body: createPerformanceTestCaseSchema }),
  createPerformanceTestCase,
);
router.delete(
  "/performance-test-cases/:id",
  validateRequest({ params: performanceTestCaseParamSchema }),
  deletePerformanceTestCase,
);

// Upload Problems Route
router.post(
  "/upload-problems",
  validateRequest({ body: uploadProblemsSchema }),
  uploadProblems,
);

// Moderation Routes (must be before /problems/:id to avoid param matching)
router.use("/problems", adminModerationRouter);

// Problem Editor Routes
router.get(
  "/problems",
  validateRequest({ query: adminProblemsQuerySchema }),
  getProblemsForAdmin,
);
router.get(
  "/problems/:id",
  validateRequest({ params: problemIdParamSchema }),
  getProblemForEditor,
);
router.post(
  "/problems/run-reference-solution",
  validateRequest({ body: runReferenceSolutionSchema }),
  runReferenceSolution,
);
router.post(
  "/problems",
  validateRequest({ body: problemEditorSchema }),
  upsertProblem,
);
router.put(
  "/problems/:id",
  validateRequest({ params: problemIdParamSchema, body: problemEditorSchema }),
  upsertProblem,
);

// Runtime Analyzer Route
router.post(
  "/problems/:problemId/runtime-analyzer",
  validateRequest({
    params: runtimeAnalyzerParamSchema,
    body: runtimeAnalyzerSchema,
  }),
  runtimeAnalyzer,
);

// Toggle Problem Hidden Status
router.patch(
  "/problems/:id/hidden",
  validateRequest({ params: problemIdParamSchema, body: toggleHiddenSchema }),
  toggleProblemHidden,
);

// Toggle Problem Published Status
router.patch(
  "/problems/:id/publish",
  validateRequest({ params: problemIdParamSchema, body: togglePublishSchema }),
  toggleProblemPublish,
);

// Validation Routes
router.post(
  "/validate-complexity-cases",
  validateRequest({ body: validateComplexitySchema }),
  validateComplexityCases,
);
router.post(
  "/validate-problem",
  validateRequest({ body: uploadProblemsSchema }),
  validateProblem,
);

router.post(
  "/bulkSignup",
  validateRequest({ body: bulkSignUpSchema }),
  bulkSignUp,
);
router.get("/colleges", getColleges);
router.post(
  "/colleges",
  validateRequest({ body: createCollegeSchema }),
  createCollege,
);
router.post(
  "/bulk-student-signup",
  singleExcelUpload,
  validateRequest({ body: bulkSignupMetaSchema }),
  bulkStudentSignUp,
);
router.post(
  "/bulk-teacher-signup",
  singleExcelUpload,
  validateRequest({ body: bulkSignupMetaSchema }),
  bulkTeacherSignUp,
);
router.post(
  "/bulk-signup/upload-csv",
  validateRequest({ body: bulkSignupCsvSchema }),
  bulkSignupUploadCsv,
);
router.post(
  "/single-signup",
  validateRequest({ body: adminSingleSignUpSchema }),
  adminSingleSignUp,
);
router.patch(
  "/assign-role",
  validateRequest({ body: adminAssignRoleSchema }),
  assignUserRoleByEmail,
);
router.post(
  "/reset-password-by-email",
  validateRequest({ body: adminResetPasswordSchema }),
  resetUserPasswordByEmail,
);
router.post(
  "/send-credentials-email",
  singleExcelUpload,
  sendCredentialsEmail,
);

// Analytics Routes
router.use("/analytics", adminAnalyticsRouter);

export default router;
