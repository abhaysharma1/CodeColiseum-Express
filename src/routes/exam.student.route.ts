import { Router } from "express";
import {
  getProblemDescription,
  getSubmissions,
  getTestCases,
  getExamDetails,
  getTestProblems,
  heartbeat,
  startTest,
  submitCode,
  submitTest,
} from "../controllers/student.exam.controllers";

const router = Router();

// GET routes
router.get("/problem-description", getProblemDescription);
router.get("/submissions", getSubmissions);
router.get("/test-cases", getTestCases);
router.get("/exam-details", getExamDetails);

// POST routes (require request body data)
router.post("/test-problems", getTestProblems);
router.post("/heartbeat", heartbeat);
router.post("/start-test", startTest);
router.post("/submit-code", submitCode);
router.post("/submit-test", submitTest);

export default router;