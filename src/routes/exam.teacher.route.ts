import {
  draftExam,
  fetchAllExams,
  getAiEvaluationStatus,
  getAllExamProblem,
  getAllGroupExams,
  getAllGroups,
  getExam,
  getExamAIResults,
  getExamResults,
  publishExam,
  saveDraft,
  startAiEvaluation,
} from "@/controllers/teacher.controllers";
import { requirePermission } from "@/middleware/permission.middleware";
import { PERMISSIONS } from "@/permissions/permission.constants";
import { Router } from "express";

const router = Router();

router.get("/fetchallexams", requirePermission(PERMISSIONS.EXAM_EDIT), fetchAllExams);

router.get("/draftexam", requirePermission(PERMISSIONS.EXAM_CREATE), draftExam);

router.get("/getexam", requirePermission(PERMISSIONS.EXAM_EDIT), getExam);

router.get("/getallgroups", requirePermission(PERMISSIONS.GROUP_VIEW), getAllGroups);

router.get("/getallexamgroups", requirePermission(PERMISSIONS.EXAM_EDIT), getAllGroupExams);

router.get("/getallexamproblem", requirePermission(PERMISSIONS.EXAM_EDIT), getAllExamProblem);

router.post("/savedraft", requirePermission(PERMISSIONS.EXAM_EDIT), saveDraft);

router.post("/publishexam", requirePermission(PERMISSIONS.EXAM_PUBLISH), publishExam);

router.get("/getresults", requirePermission(PERMISSIONS.SUBMISSION_VIEW), getExamResults);

router.get("/getairesult", requirePermission(PERMISSIONS.ANALYTICS_VIEW), getExamAIResults);



router.post("/start-ai-evaluation", requirePermission(PERMISSIONS.SUBMISSION_GRADE), startAiEvaluation);

router.get("/get-ai-evaluation-status", requirePermission(PERMISSIONS.ANALYTICS_VIEW), getAiEvaluationStatus);

export default router;
