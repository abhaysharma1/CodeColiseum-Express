import { Router } from "express";
import { validateRequest } from "@/middleware/validation";
import {
  createTeacherProblem,
  deleteTeacherProblem,
  getMyProblems,
  getTeacherProblemForEditor,
  resubmitProblem,
  runTeacherReferenceSolution,
  updateTeacherProblem,
} from "./teacher-problem.controller";
import {
  createTeacherProblemSchema,
  myProblemsQuerySchema,
  problemIdParamSchema,
  runReferenceSolutionSchema,
  updateTeacherProblemSchema,
} from "./teacher-problem.schema";

const router = Router();

router.post(
  "/",
  validateRequest({ body: createTeacherProblemSchema }),
  createTeacherProblem,
);
router.get(
  "/",
  validateRequest({ query: myProblemsQuerySchema }),
  getMyProblems,
);
router.post(
  "/run-reference-solution",
  validateRequest({ body: runReferenceSolutionSchema }),
  runTeacherReferenceSolution,
);
router.get(
  "/:id",
  validateRequest({ params: problemIdParamSchema }),
  getTeacherProblemForEditor,
);
router.patch(
  "/:id",
  validateRequest({
    params: problemIdParamSchema,
    body: updateTeacherProblemSchema,
  }),
  updateTeacherProblem,
);
router.delete(
  "/:id",
  validateRequest({ params: problemIdParamSchema }),
  deleteTeacherProblem,
);
router.post(
  "/:id/resubmit",
  validateRequest({ params: problemIdParamSchema }),
  resubmitProblem,
);

export default router;
