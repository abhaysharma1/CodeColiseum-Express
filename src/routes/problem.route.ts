import { getProblems, getProblemTags } from "@/controllers/problem.controllers";
import { Router } from "express";

const router = Router();

router.get("/getproblems", getProblems);

router.get("/gettags", getProblemTags);

export default router;
