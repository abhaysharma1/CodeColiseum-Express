import { Router } from "express";
import multer from "multer";
import { isAdmin } from "@/middleware/isAdmin.middleware";
import {
  uploadDriverCode,
  getProblemTestGenerator,
  createUpdateProblemTestGenerator,
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
  deleteProblemTestGenerator,
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

// Complexity Cases Routes
// router.post("/complexity-cases", uploadComplexityCases);

// Driver Code Routes
router.post("/driver-code", uploadDriverCode);

// Problem Test Generator Routes
router.get("/problem-test-generator", getProblemTestGenerator);
router.post("/problem-test-generator", createUpdateProblemTestGenerator);
router.delete("/problem-test-generator", deleteProblemTestGenerator);

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
