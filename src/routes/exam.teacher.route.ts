import {
  archiveBulkExams,
  deleteBulkExams,
  draftExam,
  exportExamsCSV,
  fetchAllExams,
  getAiEvaluationStatus,
  getAllExamProblem,
  getAllGroupExams,
  getAllGroups,
  getExam,
  getExamAIResults,
  getExamResults,
  publishBulkExams,
  publishExam,
  saveDraft,
  startAiEvaluation,
} from "@/controllers/teacher.controllers";
import {
  getChartData,
  getDashboardSummary,
  getRecentActivity,
  getTopStudents,
} from "@/controllers/admin.analytics.controllers";
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

// Dashboard Statistics Routes
router.get("/stats/summary", requirePermission(PERMISSIONS.ANALYTICS_VIEW), getDashboardSummary);

router.get("/stats/chart-data", requirePermission(PERMISSIONS.ANALYTICS_VIEW), getChartData);

router.get("/recent-activity", requirePermission(PERMISSIONS.ANALYTICS_VIEW), getRecentActivity);

router.get("/top-students", requirePermission(PERMISSIONS.ANALYTICS_VIEW), getTopStudents);

// Bulk Action Routes
router.post("/publish-bulk", requirePermission(PERMISSIONS.EXAM_PUBLISH), publishBulkExams);

router.post("/delete-bulk", requirePermission(PERMISSIONS.EXAM_EDIT), deleteBulkExams);

router.post("/archive-bulk", requirePermission(PERMISSIONS.EXAM_EDIT), archiveBulkExams);

router.post("/export-csv", requirePermission(PERMISSIONS.EXAM_EDIT), exportExamsCSV);

export default router;
