import { Router } from "express";
import isStudent from "@/middleware/isStudent.middleware";
import {
  getMyLabs,
  getMyLab,
  getModuleProblems,
  getModuleProgress,
  getModuleAssessment,
  getModuleProblem,
} from "@/controllers/lab.student.controllers";
import {
  isLabAiEnabled,
  labChatWithAi,
  getLabAiChatStatus,
} from "@/controllers/lab.ai.controllers";

const router = Router();

router.use(isStudent);

router.get("/my-labs", getMyLabs);
router.get("/my-labs/:labId", getMyLab);
router.get("/modules/:moduleId/problems", getModuleProblems);
router.get("/modules/:moduleId/progress", getModuleProgress);
router.get("/modules/:moduleId/assessment", getModuleAssessment);
router.get("/module-problems/:moduleProblemId", getModuleProblem);

// Lab AI Assist
router.get("/ai/isenabled", isLabAiEnabled);
router.post("/ai/chat", labChatWithAi);
router.get("/ai/chat/status", getLabAiChatStatus);

export default router;
