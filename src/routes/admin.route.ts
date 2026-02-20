import { Router } from "express";
import { isAdmin } from "@/middleware/isAdmin.middleware";
import {
  uploadComplexityCases,
  uploadDriverCode,
  getProblemTestGenerator,
  createUpdateProblemTestGenerator,
  uploadProblems,
  validateComplexityCases,
  validateProblem,
} from "@/controllers/admin.controllers";

const router = Router();

// Apply admin middleware to all routes
router.use(isAdmin);

// Complexity Cases Routes
router.post("/complexity-cases", uploadComplexityCases);

// Driver Code Routes
router.post("/driver-code", uploadDriverCode);

// Problem Test Generator Routes
router.get("/problem-test-generator", getProblemTestGenerator);
router.post("/problem-test-generator", createUpdateProblemTestGenerator);

// Upload Problems Route
router.post("/upload-problems", uploadProblems);

// Validation Routes
router.post("/validate-complexity-cases", validateComplexityCases);
router.post("/validate-problem", validateProblem);

export default router;