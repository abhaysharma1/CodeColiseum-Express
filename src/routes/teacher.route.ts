import { Router } from "express";
import teacherExamRouter from "@/routes/exam.teacher.route";
import { isTeacher } from "@/middleware/isTeacher.middleware";
import { addCoTeacherToGroup, addMemberToGroup, createGroup, getAllGroups, getGroupDetails, getGroupExams, getGroupMembers, removeMemberFromGroup, updateGroupDetails, getStudentGroups, getStudentGroupsStats } from "@/controllers/teacher.controllers";
import {
	getGroupOverallStats,
	getGroupProblemStats,
	getStudentOverallStats,
	getStudentProblemStats,
	getAnalyticsStudents,
	getStudentDetailedAnalytics,
	getAnalyticsOverview,
	getAnalyticsCharts,
	getAnalyticsProblems,
	getAnalyticsProblemDetails,
	getAnalyticsProblemStudents,
	getAnalyticsExams,
	getAnalyticsExamDetails,
	exportAnalyticsCSV,
	exportAnalyticsPDF,
} from "@/controllers/teacher.stats.controllers";
import {
	createTeacherProblem,
	getMyProblems,
	getTeacherProblemForEditor,
	updateTeacherProblem,
	deleteTeacherProblem,
	resubmitProblem,
	runTeacherReferenceSolution,
} from "@/controllers/teacherProblem.controllers";
import { requirePermission } from "@/middleware/permission.middleware";
import { PERMISSIONS } from "@/permissions/permission.constants";

const router = Router();

const getGroupIdFromQuery = (req: { query: { groupId?: unknown } }): string | undefined =>
	typeof req.query.groupId === "string" ? req.query.groupId : undefined;

const getGroupIdFromBody = (req: { body?: { groupId?: unknown } }): string | undefined =>
	typeof req.body?.groupId === "string" ? req.body.groupId : undefined;

router.use(isTeacher);

router.use("/exam", teacherExamRouter);

// Teacher Problem Management
router.post("/problems", createTeacherProblem);
router.get("/problems", getMyProblems);
router.post("/problems/run-reference-solution", runTeacherReferenceSolution);
router.get("/problems/:id", getTeacherProblemForEditor);
router.patch("/problems/:id", updateTeacherProblem);
router.delete("/problems/:id", deleteTeacherProblem);
router.post("/problems/:id/resubmit", resubmitProblem);

router.post("/creategroup", requirePermission(PERMISSIONS.GROUP_EDIT), createGroup);

router.get("/getallgroups", requirePermission(PERMISSIONS.GROUP_VIEW), getAllGroups);

router.get("/student-groups", requirePermission(PERMISSIONS.GROUP_VIEW), getStudentGroups);

router.get("/student-groups/stats", requirePermission(PERMISSIONS.GROUP_VIEW), getStudentGroupsStats);

router.get(
	"/getgroupdetails",
	requirePermission(PERMISSIONS.GROUP_VIEW, getGroupIdFromQuery),
	getGroupDetails
);

router.get(
	"/getgroupmembers",
	requirePermission(PERMISSIONS.GROUP_VIEW, getGroupIdFromQuery),
	getGroupMembers
);

router.get(
	"/getgroupexams",
	requirePermission(PERMISSIONS.GROUP_VIEW, getGroupIdFromQuery),
	getGroupExams
);

router.post(
	"/addmembertogroup",
	requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
	addMemberToGroup
);

router.post(
	"/addcoteachertogroup",
	requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
	addCoTeacherToGroup
);

router.post(
	"/removememberfromgroup",
	requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
	removeMemberFromGroup
);

router.post(
	"/updategroupdetails",
	requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
	updateGroupDetails
);

router.get(
	"/group-overall-stats",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getGroupOverallStats
);
router.get(
	"/group-problem-stats",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getGroupProblemStats
);
router.get(
	"/student-overall-stats",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getStudentOverallStats
);
router.get(
	"/student-problem-stats",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getStudentProblemStats
);

// Enhanced analytics endpoints
router.get(
	"/analytics/students",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getAnalyticsStudents
);
router.get(
	"/analytics/overview",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getAnalyticsOverview
);
router.get(
	"/analytics/charts",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getAnalyticsCharts
);
router.get(
	"/analytics/students/:studentId/details",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getStudentDetailedAnalytics
);

router.get(
	"/analytics/problems",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getAnalyticsProblems
);
router.get(
	"/analytics/problems/:problemId/details",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getAnalyticsProblemDetails
);
router.get(
	"/analytics/problems/:problemId/students",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getAnalyticsProblemStudents
);

router.get(
	"/analytics/exams",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getAnalyticsExams
);
router.get(
	"/analytics/exams/:examId/details",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	getAnalyticsExamDetails
);

router.get(
	"/analytics/export-csv",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	exportAnalyticsCSV
);

router.get(
	"/analytics/export-pdf",
	requirePermission(PERMISSIONS.ANALYTICS_VIEW, getGroupIdFromQuery),
	exportAnalyticsPDF
);

export default router;
