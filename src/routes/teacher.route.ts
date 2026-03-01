import { Router } from "express";
import teacherExamRouter from "@/routes/exam.teacher.route";
import { isTeacher } from "@/middleware/isTeacher.middleware";
import { addMemberToGroup, createGroup, getAllGroups, getGroupDetails, getGroupMembers } from "@/controllers/teacher.controllers";
import { getGroupOverallStats, getGroupProblemStats, getStudentOverallStats, getStudentProblemStats } from "@/controllers/teacher.stats.controllers";

const router = Router();

router.use(isTeacher);

router.use("/exam", teacherExamRouter);

router.post("/creategroup", createGroup);

router.get("/getallgroups", getAllGroups);

router.get("/getgroupdetails", getGroupDetails);

router.get("/getgroupmembers", getGroupMembers);

router.post("/addmembertogroup", addMemberToGroup);

router.get("/group-overall-stats", getGroupOverallStats);
router.get("/group-problem-stats", getGroupProblemStats);
router.get("/student-overall-stats", getStudentOverallStats);
router.get("/student-problem-stats", getStudentProblemStats);

export default router;
