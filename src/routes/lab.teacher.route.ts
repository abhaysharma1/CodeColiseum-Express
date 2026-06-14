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

// Lab Assignment
router.post("/labs/:labId/assign", requirePermission(PERMISSIONS.LAB_ASSIGN), labController.assignLab);
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

export default router;
