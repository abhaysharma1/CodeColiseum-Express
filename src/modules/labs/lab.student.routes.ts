import { Router } from "express";
import isStudent from "@/middleware/isStudent.middleware";
import { validateRequest } from "@/middleware/validation";
import { labAiRouter } from "@/modules/ai-chat";
import {
  getMyLab,
  getMyLabs,
  getStudentModuleAssessment,
  getStudentModuleProblem,
  getStudentModuleProblems,
  getStudentModuleProgress,
} from "./lab.controller";
import {
  labIdParamSchema,
  moduleIdParamSchema,
  moduleProblemIdParamSchema,
} from "./lab.schema";

const router = Router();

router.use(isStudent);

router.get("/my-labs", getMyLabs);
router.get(
  "/my-labs/:labId",
  validateRequest({ params: labIdParamSchema }),
  getMyLab,
);
router.get(
  "/modules/:moduleId/problems",
  validateRequest({ params: moduleIdParamSchema }),
  getStudentModuleProblems,
);
router.get(
  "/modules/:moduleId/progress",
  validateRequest({ params: moduleIdParamSchema }),
  getStudentModuleProgress,
);
router.get(
  "/modules/:moduleId/assessment",
  validateRequest({ params: moduleIdParamSchema }),
  getStudentModuleAssessment,
);
router.get(
  "/module-problems/:moduleProblemId",
  validateRequest({ params: moduleProblemIdParamSchema }),
  getStudentModuleProblem,
);

// Lab AI Assist
router.use("/lab/ai", labAiRouter);

export default router;
