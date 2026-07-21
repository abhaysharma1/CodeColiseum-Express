import { Router } from "express";
import { isTeacher } from "@/middleware/isTeacher.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { PERMISSIONS } from "@/permissions/permission.constants";
import * as labController from "@/controllers/lab.teacher.controllers";

const router = Router();

router.use(isTeacher);

// Lab CRUD
router.post("/labs", requirePermission(PERMISSIONS.LAB_CREATE), labController.createLab);
router.get("/labs", requirePermission(PERMISSIONS.LAB_VIEW), labController.getLabs);
router.get("/labs/stats", requirePermission(PERMISSIONS.LAB_VIEW), labController.getLabsStats);
router.get("/labs/:labId", requirePermission(PERMISSIONS.LAB_VIEW), labController.getLab);
router.patch("/labs/:labId", requirePermission(PERMISSIONS.LAB_EDIT), labController.updateLab);
router.delete("/labs/:labId", requirePermission(PERMISSIONS.LAB_DELETE), labController.deleteLab);

// Publish/Unpublish
router.post("/labs/:labId/publish", requirePermission(PERMISSIONS.LAB_PUBLISH), labController.publishLab);
router.post("/labs/:labId/unpublish", requirePermission(PERMISSIONS.LAB_PUBLISH), labController.unpublishLab);

// Analytics
router.get("/labs/:labId/analytics", requirePermission(PERMISSIONS.ANALYTICS_VIEW), labController.getLabAnalytics);

// Lab Assignment
router.post("/labs/:labId/assign", requirePermission(PERMISSIONS.LAB_ASSIGN), labController.assignLab);
router.delete("/labs/:labId/assign", requirePermission(PERMISSIONS.LAB_ASSIGN), labController.unassignLab);
router.get("/labs/:labId/assign", requirePermission(PERMISSIONS.LAB_VIEW), labController.getLabAssignments);

// Module CRUD
router.post("/labs/:labId/modules", requirePermission(PERMISSIONS.LAB_EDIT), labController.createModule);
router.get("/labs/:labId/modules", requirePermission(PERMISSIONS.LAB_VIEW), labController.getLabModules);
router.get("/modules/:moduleId", requirePermission(PERMISSIONS.LAB_VIEW), labController.getModule);
router.patch("/modules/:moduleId", requirePermission(PERMISSIONS.LAB_EDIT), labController.updateModule);
router.delete("/modules/:moduleId", requirePermission(PERMISSIONS.LAB_EDIT), labController.deleteModule);

// Module Problems
router.post("/modules/:moduleId/problems", requirePermission(PERMISSIONS.LAB_EDIT), labController.addModuleProblems);
router.get("/modules/:moduleId/problems", requirePermission(PERMISSIONS.LAB_VIEW), labController.getModuleProblems);
router.delete("/module-problems/:moduleProblemId", requirePermission(PERMISSIONS.LAB_EDIT), labController.removeModuleProblem);

// Module Problem Access Control
router.patch("/module-problems/:moduleProblemId/access", requirePermission(PERMISSIONS.LAB_EDIT), labController.updateModuleProblemAccess);
router.get("/module-problems/:moduleProblemId/access", requirePermission(PERMISSIONS.LAB_VIEW), labController.getModuleProblemAccess);

// Assessment
router.post("/modules/:moduleId/assessment", requirePermission(PERMISSIONS.LAB_EDIT), labController.assignAssessment);
router.patch("/modules/:moduleId/assessment", requirePermission(PERMISSIONS.LAB_EDIT), labController.updateAssessment);
router.delete("/modules/:moduleId/assessment", requirePermission(PERMISSIONS.LAB_EDIT), labController.removeAssessment);
router.post("/modules/:moduleId/create-assessment", requirePermission(PERMISSIONS.LAB_EDIT), labController.createAssessment);
router.get("/modules/:moduleId/assessment", requirePermission(PERMISSIONS.LAB_VIEW), labController.getAssessment);

// Analytics
router.get("/modules/:moduleId/assessment-results", requirePermission(PERMISSIONS.ANALYTICS_VIEW), labController.getAssessmentResults);
router.get("/modules/:moduleId/student-progress", requirePermission(PERMISSIONS.ANALYTICS_VIEW), labController.getModuleStudentProgress);
router.get("/modules/:moduleId/problem-analytics", requirePermission(PERMISSIONS.ANALYTICS_VIEW), labController.getModuleProblemAnalytics);

router.get("/modules/:moduleId/export-excel", requirePermission(PERMISSIONS.ANALYTICS_VIEW), labController.exportModuleAnalytics);

// Lab Teacher Management (search must come before /labs/:labId/teachers)
router.get("/teachers/search", requirePermission(PERMISSIONS.LAB_VIEW), labController.searchTeachers);
router.post("/labs/:labId/teachers", requirePermission(PERMISSIONS.LAB_EDIT), labController.addLabTeacher);
router.delete("/labs/:labId/teachers/:teacherUserId", requirePermission(PERMISSIONS.LAB_EDIT), labController.removeLabTeacher);
router.get("/labs/:labId/teachers", requirePermission(PERMISSIONS.LAB_VIEW), labController.getLabTeachers);

export default router;
