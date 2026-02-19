import { Router } from "express";
import teacherExamRouter from "@/routes/exam.teacher.route";
import { isTeacher } from "@/middleware/isTeacher";
import { addMemberToGroup, createGroup, getAllGroups, getGroupDetails, getGroupMembers } from "@/controllers/teacher.controllers";

const router = Router();

router.use(isTeacher);

router.use("/exam", teacherExamRouter);

router.post("/creategroup", createGroup);

router.get("/getallgroups", getAllGroups);

router.get("/getgroupdetails", getGroupDetails);

router.get("/getgroupmembers", getGroupMembers);

router.post("/addmembertogroup", addMemberToGroup);

export default router;
