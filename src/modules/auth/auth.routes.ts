import { Router } from "express";
import { validateBody } from "@/middleware/validation";
import {
  publicSignup,
  requestPasswordResetHandler,
} from "./auth.controller";
import {
  publicSignupSchema,
  requestPasswordResetSchema,
} from "./auth.schema";

const router = Router();

router.post("/signup", validateBody(publicSignupSchema), publicSignup);
router.post(
  "/request-password-reset",
  validateBody(requestPasswordResetSchema),
  requestPasswordResetHandler,
);

export default router;
