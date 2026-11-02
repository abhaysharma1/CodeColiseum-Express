import { Router } from "express";
import { isTeacher } from "@/middleware/isTeacher.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { PERMISSIONS } from "@/permissions/permission.constants";
import { validateRequest } from "@/middleware/validation";
import { publishLabSchema } from "@/modules/marketplace/marketplace.schema";
import * as labController from "./lab.controller";
import { exportModuleAnalytics } from "./module-export.controller";
import {
  addLabTeacherSchema,
  addModuleProblemsSchema,
  assignAssessmentSchema,
  assignLabSchema,
  createAssessmentSchema,
  createLabSchema,
  createModuleSchema,
  labIdParamSchema,
  labTeacherParamSchema,
  listLabsQuerySchema,
  moduleAnalyticsQuerySchema,
  moduleExportQuerySchema,
  moduleIdParamSchema,
  moduleProblemIdParamSchema,
  moduleStudentParamSchema,
  moduleStudentProblemParamSchema,
  studentProgressQuerySchema,
  teacherSearchQuerySchema,
  updateLabSchema,
  updateModuleProblemAccessSchema,
  updateModuleSchema,
} from "./lab.schema";

const router = Router();

router.use(isTeacher);

// Lab CRUD
router.post(
  "/labs",
  requirePermission(PERMISSIONS.LAB_CREATE),
  validateRequest({ body: createLabSchema }),
  labController.createLab,
);
router.get(
  "/labs",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ query: listLabsQuerySchema }),
  labController.getLabs,
);
router.get(
  "/labs/stats",
  requirePermission(PERMISSIONS.LAB_VIEW),
  labController.getLabsStats,
);
router.get(
  "/labs/:labId",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: labIdParamSchema }),
  labController.getLab,
);
router.patch(
  "/labs/:labId",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: labIdParamSchema, body: updateLabSchema }),
  labController.updateLab,
);
router.delete(
  "/labs/:labId",
  requirePermission(PERMISSIONS.LAB_DELETE),
  validateRequest({ params: labIdParamSchema }),
  labController.deleteLab,
);

// Publish/Unpublish
router.post(
  "/labs/:labId/publish",
  requirePermission(PERMISSIONS.LAB_PUBLISH),
  validateRequest({ params: labIdParamSchema, body: publishLabSchema }),
  labController.publishLab,
);
router.post(
  "/labs/:labId/unpublish",
  requirePermission(PERMISSIONS.LAB_PUBLISH),
  validateRequest({ params: labIdParamSchema }),
  labController.unpublishLab,
);

// Analytics
router.get(
  "/labs/:labId/analytics",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({ params: labIdParamSchema }),
  labController.getLabAnalytics,
);

// Lab Assignment
router.post(
  "/labs/:labId/assign",
  requirePermission(PERMISSIONS.LAB_ASSIGN),
  validateRequest({ params: labIdParamSchema, body: assignLabSchema }),
  labController.assignLab,
);
router.delete(
  "/labs/:labId/assign",
  requirePermission(PERMISSIONS.LAB_ASSIGN),
  validateRequest({ params: labIdParamSchema }),
  labController.unassignLab,
);
router.get(
  "/labs/:labId/assign",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: labIdParamSchema }),
  labController.getLabAssignments,
);

// Module CRUD
router.post(
  "/labs/:labId/modules",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: labIdParamSchema, body: createModuleSchema }),
  labController.createModule,
);
router.get(
  "/labs/:labId/modules",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: labIdParamSchema }),
  labController.getLabModules,
);
router.get(
  "/modules/:moduleId",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: moduleIdParamSchema }),
  labController.getModule,
);
router.patch(
  "/modules/:moduleId",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: moduleIdParamSchema, body: updateModuleSchema }),
  labController.updateModule,
);
router.delete(
  "/modules/:moduleId",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: moduleIdParamSchema }),
  labController.deleteModule,
);

// Module Problems
router.post(
  "/modules/:moduleId/problems",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({
    params: moduleIdParamSchema,
    body: addModuleProblemsSchema,
  }),
  labController.addModuleProblems,
);
router.get(
  "/modules/:moduleId/problems",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: moduleIdParamSchema }),
  labController.getModuleProblems,
);
router.delete(
  "/module-problems/:moduleProblemId",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: moduleProblemIdParamSchema }),
  labController.removeModuleProblem,
);

// Module Problem Access Control
router.patch(
  "/module-problems/:moduleProblemId/access",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({
    params: moduleProblemIdParamSchema,
    body: updateModuleProblemAccessSchema,
  }),
  labController.updateModuleProblemAccess,
);
router.get(
  "/module-problems/:moduleProblemId/access",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: moduleProblemIdParamSchema }),
  labController.getModuleProblemAccess,
);

// Assessment
router.post(
  "/modules/:moduleId/assessment",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: moduleIdParamSchema, body: assignAssessmentSchema }),
  labController.assignAssessment,
);
router.patch(
  "/modules/:moduleId/assessment",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: moduleIdParamSchema, body: assignAssessmentSchema }),
  labController.updateAssessment,
);
router.delete(
  "/modules/:moduleId/assessment",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: moduleIdParamSchema }),
  labController.removeAssessment,
);
router.post(
  "/modules/:moduleId/create-assessment",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: moduleIdParamSchema, body: createAssessmentSchema }),
  labController.createAssessment,
);
router.get(
  "/modules/:moduleId/assessment",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: moduleIdParamSchema }),
  labController.getAssessment,
);

// Analytics
router.get(
  "/modules/:moduleId/assessment-results",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({
    params: moduleIdParamSchema,
    query: moduleAnalyticsQuerySchema,
  }),
  labController.getAssessmentResults,
);
router.get(
  "/modules/:moduleId/student-progress",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({
    params: moduleIdParamSchema,
    query: studentProgressQuerySchema,
  }),
  labController.getModuleStudentProgress,
);
router.get(
  "/modules/:moduleId/student-attempts/:studentId",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({ params: moduleStudentParamSchema }),
  labController.getModuleStudentAttempts,
);
router.get(
  "/modules/:moduleId/student-attempts/:studentId/problems/:moduleProblemId/submissions",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({ params: moduleStudentProblemParamSchema }),
  labController.getModuleStudentProblemSubmissions,
);
router.get(
  "/modules/:moduleId/problem-analytics",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({
    params: moduleIdParamSchema,
    query: moduleAnalyticsQuerySchema,
  }),
  labController.getModuleProblemAnalytics,
);

router.get(
  "/modules/:moduleId/export-excel",
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  validateRequest({
    params: moduleIdParamSchema,
    query: moduleExportQuerySchema,
  }),
  exportModuleAnalytics,
);

// Lab Teacher Management (search must come before /labs/:labId/teachers)
router.get(
  "/teachers/search",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ query: teacherSearchQuerySchema }),
  labController.searchTeachers,
);
router.post(
  "/labs/:labId/teachers",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: labIdParamSchema, body: addLabTeacherSchema }),
  labController.addLabTeacher,
);
router.delete(
  "/labs/:labId/teachers/:teacherUserId",
  requirePermission(PERMISSIONS.LAB_EDIT),
  validateRequest({ params: labTeacherParamSchema }),
  labController.removeLabTeacher,
);
router.get(
  "/labs/:labId/teachers",
  requirePermission(PERMISSIONS.LAB_VIEW),
  validateRequest({ params: labIdParamSchema }),
  labController.getLabTeachers,
);

export default router;
