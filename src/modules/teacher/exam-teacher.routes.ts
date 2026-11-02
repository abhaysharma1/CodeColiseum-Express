import { Router } from "express";
import { requirePermission } from "@/middleware/authorization";
import { validateRequest } from "@/middleware/validation";
import { teacherAnalyticsRouter } from "@/modules/analytics";
import { PERMISSIONS } from "@/permissions/permission.constants";
import { getAllGroups } from "./teacher.controller";
import {
  archiveBulkExams,
  deleteBulkExams,
  draftExam,
  duplicateExam,
  exportExamsCSV,
  fetchAllExams,
  getAiEvaluationStatus,
  getAllExamProblem,
  getAllGroupExams,
  getExam,
  getExamAIResults,
  getExamDashboardStats,
  getExamResults,
  publishBulkExams,
  publishExam,
  saveDraft,
  startAiEvaluation,
  updateExamSettings,
} from "./exam-teacher.controller";
import {
  bulkExamActionBodySchema,
  examIdBodySchema,
  examIdQuerySchema,
  fetchAllExamsQuerySchema,
  saveExamBodySchema,
  teacherGroupsQuerySchema,
  updateExamSettingsBodySchema,
} from "./teacher.schema";

const router = Router();

router.get(
  "/fetchallexams",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ query: fetchAllExamsQuerySchema }),
  fetchAllExams,
);

router.get(
  "/dashboard",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  getExamDashboardStats,
);

router.get(
  "/draftexam",
  requirePermission(PERMISSIONS.EXAM_CREATE),
  draftExam,
);

router.get(
  "/duplicate",
  requirePermission(PERMISSIONS.EXAM_CREATE),
  validateRequest({ query: examIdQuerySchema }),
  duplicateExam,
);

router.get(
  "/getexam",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ query: examIdQuerySchema }),
  getExam,
);

router.get(
  "/getallgroups",
  requirePermission(PERMISSIONS.GROUP_VIEW),
  validateRequest({ query: teacherGroupsQuerySchema }),
  getAllGroups,
);

router.get(
  "/getallexamgroups",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ query: examIdQuerySchema }),
  getAllGroupExams,
);

router.get(
  "/getallexamproblem",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ query: examIdQuerySchema }),
  getAllExamProblem,
);

router.post(
  "/savedraft",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ body: saveExamBodySchema }),
  saveDraft,
);

router.post(
  "/publishexam",
  requirePermission(PERMISSIONS.EXAM_PUBLISH),
  validateRequest({ body: saveExamBodySchema }),
  publishExam,
);

router.post(
  "/updateexamsettings",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ body: updateExamSettingsBodySchema }),
  updateExamSettings,
);

router.get(
  "/getresults",
  requirePermission(PERMISSIONS.SUBMISSION_VIEW),
  validateRequest({ query: examIdQuerySchema }),
  getExamResults,
);

router.get(
  "/getairesult",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({ query: examIdQuerySchema }),
  getExamAIResults,
);

router.post(
  "/start-ai-evaluation",
  requirePermission(PERMISSIONS.SUBMISSION_GRADE),
  validateRequest({ body: examIdBodySchema }),
  startAiEvaluation,
);

router.get(
  "/get-ai-evaluation-status",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({ query: examIdQuerySchema }),
  getAiEvaluationStatus,
);

// Dashboard Statistics Routes
router.use(teacherAnalyticsRouter);

// Bulk Action Routes
router.post(
  "/publish-bulk",
  requirePermission(PERMISSIONS.EXAM_PUBLISH),
  validateRequest({ body: bulkExamActionBodySchema }),
  publishBulkExams,
);

router.post(
  "/delete-bulk",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ body: bulkExamActionBodySchema }),
  deleteBulkExams,
);

router.post(
  "/archive-bulk",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ body: bulkExamActionBodySchema }),
  archiveBulkExams,
);

router.post(
  "/export-csv",
  requirePermission(PERMISSIONS.EXAM_EDIT),
  validateRequest({ body: bulkExamActionBodySchema }),
  exportExamsCSV,
);

export default router;
