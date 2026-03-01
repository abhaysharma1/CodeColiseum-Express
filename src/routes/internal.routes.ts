import { finalizeExams } from "@/controllers/internal.controllers";
import { Router } from "express";

const router = Router()

router.post("/exams/finalize",finalizeExams)

export default router