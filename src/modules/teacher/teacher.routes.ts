import { Router } from "express";
import { isTeacher } from "@/middleware/isTeacher.middleware";
import { requirePermission } from "@/middleware/authorization";
import { validateRequest } from "@/middleware/validation";
import { groupAnalyticsRouter } from "@/modules/analytics";
import { teacherProblemsRouter } from "@/modules/problems";
import { PERMISSIONS } from "@/permissions/permission.constants";
import examTeacherRouter from "./exam-teacher.routes";
import {
  addCoTeacherToGroup,
  addMemberToGroup,
  createGroup,
  deleteGroup,
  getAllGroups,
  getGroupDetails,
  getGroupExams,
  getGroupMembers,
  getStudentGroups,
  getStudentGroupsStats,
  removeMemberFromGroup,
  updateGroupDetails,
} from "./teacher.controller";
import {
  addCoTeacherBodySchema,
  addMemberBodySchema,
  createGroupBodySchema,
  deleteGroupBodySchema,
  groupIdQuerySchema,
  groupMembersQuerySchema,
  removeMemberBodySchema,
  studentGroupsQuerySchema,
  teacherGroupsQuerySchema,
  updateGroupBodySchema,
} from "./teacher.schema";

const router = Router();

const getGroupIdFromQuery = (req: {
  query: { groupId?: unknown };
}): string | undefined =>
  typeof req.query.groupId === "string" ? req.query.groupId : undefined;

const getGroupIdFromBody = (req: {
  body?: { groupId?: unknown };
}): string | undefined =>
  typeof req.body?.groupId === "string" ? req.body.groupId : undefined;

router.use(isTeacher);

router.use("/exam", examTeacherRouter);

// Teacher Problem Management
router.use("/problems", teacherProblemsRouter);

router.post(
  "/creategroup",
  requirePermission(PERMISSIONS.GROUP_EDIT),
  validateRequest({ body: createGroupBodySchema }),
  createGroup,
);

router.get(
  "/getallgroups",
  requirePermission(PERMISSIONS.GROUP_VIEW),
  validateRequest({ query: teacherGroupsQuerySchema }),
  getAllGroups,
);

router.get(
  "/student-groups",
  requirePermission(PERMISSIONS.GROUP_VIEW),
  validateRequest({ query: studentGroupsQuerySchema }),
  getStudentGroups,
);

router.get(
  "/student-groups/stats",
  requirePermission(PERMISSIONS.GROUP_VIEW),
  getStudentGroupsStats,
);

router.get(
  "/getgroupdetails",
  requirePermission(PERMISSIONS.GROUP_VIEW, getGroupIdFromQuery),
  validateRequest({ query: groupIdQuerySchema }),
  getGroupDetails,
);

router.get(
  "/getgroupmembers",
  requirePermission(PERMISSIONS.GROUP_VIEW, getGroupIdFromQuery),
  validateRequest({ query: groupMembersQuerySchema }),
  getGroupMembers,
);

router.get(
  "/getgroupexams",
  requirePermission(PERMISSIONS.GROUP_VIEW, getGroupIdFromQuery),
  validateRequest({ query: groupIdQuerySchema }),
  getGroupExams,
);

router.post(
  "/addmembertogroup",
  requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
  validateRequest({ body: addMemberBodySchema }),
  addMemberToGroup,
);

router.post(
  "/addcoteachertogroup",
  requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
  validateRequest({ body: addCoTeacherBodySchema }),
  addCoTeacherToGroup,
);

router.post(
  "/removememberfromgroup",
  requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
  validateRequest({ body: removeMemberBodySchema }),
  removeMemberFromGroup,
);

router.post(
  "/updategroupdetails",
  requirePermission(PERMISSIONS.GROUP_EDIT, getGroupIdFromBody),
  validateRequest({ body: updateGroupBodySchema }),
  updateGroupDetails,
);

router.post(
  "/deletegroup",
  requirePermission(PERMISSIONS.GROUP_DELETE, getGroupIdFromBody),
  validateRequest({ body: deleteGroupBodySchema }),
  deleteGroup,
);

router.use(groupAnalyticsRouter);

export default router;
