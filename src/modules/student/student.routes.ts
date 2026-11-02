import { Router } from "express";
import { requireStudent } from "@/middleware/authentication";
import { validateRequest } from "@/middleware/validation";
import { examsRouter } from "@/modules/exams";
import {
  getAllGroups,
  getDashboardData,
  getExamAIResult,
  getExamResult,
  getGroupCreator,
  getGroupData,
  getGroupExams,
} from "./student.controller";
import {
  examIdQuerySchema,
  groupExamsQuerySchema,
  groupIdQuerySchema,
  studentGroupsQuerySchema,
} from "./student.schema";

const router = Router();

router.use(requireStudent);

router.get("/getdashboarddata", getDashboardData);

router.get(
  "/getgroups",
  validateRequest({ query: studentGroupsQuerySchema }),
  getAllGroups,
);

router.get(
  "/getgroupdata",
  validateRequest({ query: groupIdQuerySchema }),
  getGroupData,
);

router.get(
  "/getgroupexams",
  validateRequest({ query: groupExamsQuerySchema }),
  getGroupExams,
);

router.get(
  "/getgroupcreator",
  validateRequest({ query: groupIdQuerySchema }),
  getGroupCreator,
);

router.get(
  "/getexamresult",
  validateRequest({ query: examIdQuerySchema }),
  getExamResult,
);

router.get(
  "/getexamairesult",
  validateRequest({ query: examIdQuerySchema }),
  getExamAIResult,
);

router.use("/exam", examsRouter);

export default router;
