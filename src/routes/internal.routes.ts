import { finalizeExams, recomputeAnalytics } from "@/controllers/internal.controllers";
import { Router } from "express";

const router = Router()

router.post("/exams/finalize",finalizeExams)

router.post("/analytics/recompute", recomputeAnalytics)

export default router