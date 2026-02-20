
import { draftExam, fetchAllExams, getAiEvaluationStatus, getAllExamProblem, getAllGroupExams, getAllGroups, getExam, getExamAIResults, getExamResults, publishExam, saveDraft, startAiEvaluation } from "@/controllers/teacher.controllers";
import { Router } from "express";

const router = Router();


router.get("/fetchallexams", fetchAllExams);

router.get("/draftexam", draftExam);

router.get("/getexam", getExam);

router.get("/getallgroups", getAllGroups);

router.get("/getallexamgroups", getAllGroupExams);

router.get("/getallexamproblem", getAllExamProblem);

router.post("/savedraft",saveDraft)

router.post("/publishexam",publishExam)

router.get("/getresults",getExamResults)

router.get("/getairesult",getExamAIResults)

router.post("/start-ai-evaluation",startAiEvaluation)

router.get("/get-ai-evaluation-status",getAiEvaluationStatus)

export default router;
