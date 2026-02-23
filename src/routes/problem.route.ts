import { isLoggedIn } from "@/middleware/isLoggedin.middleware";
import {
  getProblems,
  getProblemTags,
  getProblemTestCases,
  getSubmissions,
  getTemplateCode,
  runCode,
  startPracticeAiReview,
  submitCode,
} from "../controllers/problem.controllers";
import { Router } from "express";

const router = Router();

router.use(isLoggedIn);

router.get("/getproblems", getProblems);
router.get("/gettags", getProblemTags);
router.get("/gettestcases", getProblemTestCases);
router.post("/getsubmissions", getSubmissions);
router.post("/gettemplatecode", getTemplateCode);
router.post("/runcode", runCode);
router.post("/submitcode", submitCode);

router.post("/start-ai-review", startPracticeAiReview);

export default router;
