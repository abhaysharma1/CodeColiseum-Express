import { Router } from "express";
import { requireAuth } from "@/middleware/authentication";
import { validateBody } from "@/middleware/validation";
import { formatCode } from "./formatter.controller";
import { formatCodeSchema } from "./formatter.schema";

const router = Router();

router.post("/format", requireAuth, validateBody(formatCodeSchema), formatCode);

export default router;
