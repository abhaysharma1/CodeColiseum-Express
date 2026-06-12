import { Router } from "express";
import isStudent from "@/middleware/isStudent.middleware";
import {
  getMyLabs,
  getMyLab,
  getModuleProblems,
  getModuleProgress,
  getModuleAssessment,
} from "@/controllers/lab.student.controllers";

const router = Router();

router.use(isStudent);

router.get("/my-labs", getMyLabs);
router.get("/my-labs/:labId", getMyLab);
router.get("/modules/:moduleId/problems", getModuleProblems);
router.get("/modules/:moduleId/progress", getModuleProgress);
router.get("/modules/:moduleId/assessment", getModuleAssessment);

export default router;
