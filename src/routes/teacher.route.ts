import { Router } from "express";
import teacherExamRouter from "@/routes/exam.teacher.route";
import { isTeacher } from "@/middleware/isTeacher.middleware";
import { addMemberToGroup, createGroup, getAllGroups, getGroupDetails, getGroupMembers } from "@/controllers/teacher.controllers";
import { getGroupOverallStats, getGroupProblemStats, getStudentOverallStats, getStudentProblemStats } from "@/controllers/teacher.stats.controllers";
import { requirePermission } from "@/middleware/permission.middleware";
import { PERMISSIONS } from "@/permissions/permission.constants";

const router = Router();

const getGroupIdFromQuery = (req: { query: { groupId?: unknown } }): string | undefined =>
	typeof req.query.groupId === "string" ? req.query.groupId : undefined;

const getGroupIdFromBody = (req: { body?: { groupId?: unknown } }): string | undefined =>
	typeof req.body?.groupId === "string" ? req.body.groupId : undefined;

router.use(isTeacher);

router.use("/exam", teacherExamRouter);

router.post("/creategroup", requirePermission(PERMISSIONS.GROUP_EDIT), createGroup);

router.get("/getallgroups", requirePermission(PERMISSIONS.GROUP_VIEW), getAllGroups);

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

router.post(
	"/addmembertogroup",
	requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
	addMemberToGroup
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

export default router;
