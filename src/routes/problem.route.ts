import { isLoggedIn } from "@/middleware/isLoggedin.middleware";
import {
  getProblemsList,
  getProblemDetails,
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

router.get("/getproblems", getProblemsList);
router.get("/gettags", getProblemTags);
router.get("/gettestcases", getProblemTestCases);
router.get("/:id", getProblemDetails);
router.post("/gettemplatecode", getTemplateCode);

router.use(isLoggedIn);

router.post("/getsubmissions", getSubmissions);
router.post("/runcode", runCode);
router.post("/submitcode", submitCode);
router.get("/submission-status/:submissionId", getSubmissionStatus);

export default router;
