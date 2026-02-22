import {
  getDashboardData,
  getExamAIResult,
  getExamResult,
} from "@/controllers/student.controllers";
import {
  getAllGroups,
  getGroupCreator,
  getGroupData,
  getGroupExams,
} from "@/controllers/student.group.controllers";
import isStudent from "@/middleware/isStudent.middleware";
import { Router } from "express";
import examRoutes from "@/routes/exam.student.route";

const router = Router();

router.use(isStudent);

router.get("/getdashboarddata", getDashboardData);

router.get("/getgroups", getAllGroups);

router.get("/getgroupdata", getGroupData);

router.get("/getgroupexams", getGroupExams);

router.get("/getgroupcreator", getGroupCreator);

router.get("/getexamresult", getExamResult);

router.get("/getexamairesult", getExamAIResult);

router.use("/exam", examRoutes);

export default router;
