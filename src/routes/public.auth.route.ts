import {
  publicSignup,
  requestPasswordReset,
} from "@/controllers/public.auth.controllers";
import { Router } from "express";

const router = Router();

router.post("/signup", publicSignup);
router.post("/request-password-reset", requestPasswordReset);

export default router;
