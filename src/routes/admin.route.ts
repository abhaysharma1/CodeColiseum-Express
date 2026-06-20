import { Router } from "express";
import multer from "multer";
import { isAdmin } from "@/middleware/isAdmin.middleware";
import {
  uploadDriverCode,
  getPerformanceConstraints,
  createUpdatePerformanceConstraints,
  deletePerformanceConstraints,
  getPerformanceTestCases,
  createPerformanceTestCase,
  deletePerformanceTestCase,
  uploadProblems,
  validateComplexityCases,
  validateProblem,
  bulkSignUp,
  adminSingleSignUp,
  bulkStudentSignUp,
  bulkTeacherSignUp,
  getColleges,
  createCollege,
  assignUserRoleByEmail,
  resetUserPasswordByEmail,
  getProblemForEditor,
  upsertProblem,
  getProblemsForAdmin,
  runReferenceSolution,
  runtimeAnalyzer,
  toggleProblemHidden,
  toggleProblemPublish,
} from "@/controllers/admin.controllers";
import {
  getOrgAnalyticsOverview,
  getOrgAnalyticsGroups,
  getOrgAnalyticsStudents,
  getOrgAnalyticsExams,
  getOrgAnalyticsProblems,
} from "@/controllers/admin.analytics.controllers";

const router = Router();

// Apply admin middleware to all routes
router.use(isAdmin);

// Driver Code Routes
router.post("/driver-code", uploadDriverCode);

// Performance Constraints Routes
router.get("/performance-constraints", getPerformanceConstraints);
router.post("/performance-constraints", createUpdatePerformanceConstraints);
router.delete("/performance-constraints", deletePerformanceConstraints);

// Performance Test Cases Routes
router.get("/performance-test-cases", getPerformanceTestCases);
router.post("/performance-test-cases", multer({ storage: multer.memoryStorage() }).fields([
  { name: "input", maxCount: 1 },
  { name: "output", maxCount: 1 },
]), createPerformanceTestCase);
router.delete("/performance-test-cases/:id", deletePerformanceTestCase);

// Upload Problems Route
router.post("/upload-problems", uploadProblems);

// Problem Editor Routes
router.get("/problems", getProblemsForAdmin);
router.get("/problems/:id", getProblemForEditor);
router.post("/problems/run-reference-solution", runReferenceSolution);
router.post("/problems", upsertProblem);
router.put("/problems/:id", upsertProblem);

// Runtime Analyzer Route
router.post("/problems/:problemId/runtime-analyzer", runtimeAnalyzer);

// Toggle Problem Hidden Status
router.patch("/problems/:id/hidden", toggleProblemHidden);

// Toggle Problem Published Status
router.patch("/problems/:id/publish", toggleProblemPublish);

// Validation Routes
router.post("/validate-complexity-cases", validateComplexityCases);
router.post("/validate-problem", validateProblem);

const excelUpload = multer({ storage: multer.memoryStorage() });

router.post("/bulkSignup", bulkSignUp);
router.get("/colleges", getColleges);
router.post("/colleges", createCollege);
router.post("/bulk-student-signup", excelUpload.single("file"), bulkStudentSignUp);
router.post("/bulk-teacher-signup", excelUpload.single("file"), bulkTeacherSignUp);
router.post("/single-signup", adminSingleSignUp);
router.patch("/assign-role", assignUserRoleByEmail);
router.post("/reset-password-by-email", resetUserPasswordByEmail);

// Analytics Routes
router.get("/analytics/overview", getOrgAnalyticsOverview);
router.get("/analytics/groups", getOrgAnalyticsGroups);
router.get("/analytics/students", getOrgAnalyticsStudents);
router.get("/analytics/exams", getOrgAnalyticsExams);
router.get("/analytics/problems", getOrgAnalyticsProblems);

export default router;
