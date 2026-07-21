import { isLoggedIn } from "@/middleware/isLoggedin.middleware";
import {
  getProblems,
  getProblemById,
  getSubmissionStatus,
  getProblemTags,
  getProblemTestCases,
  getSubmissions,
  getTemplateCode,
  runCode,
  submitCode,
} from "../controllers/problem.controllers";
import { Router } from "express";

const router = Router();

router.get("/getproblems", getProblems);
router.get("/gettags", getProblemTags);
router.get("/:id", getProblemById);
router.get("/gettestcases", getProblemTestCases);
router.post("/gettemplatecode", getTemplateCode);

router.use(isLoggedIn);

router.post("/getsubmissions", getSubmissions);
router.post("/runcode", runCode);
router.post("/submitcode", submitCode);
router.get("/submission-status/:submissionId", getSubmissionStatus);

export default router;
