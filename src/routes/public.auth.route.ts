import { publicSignup } from "@/controllers/public.auth.controllers";
import { Router } from "express";

const router = Router();

router.post("/signup", publicSignup);

export default router;
