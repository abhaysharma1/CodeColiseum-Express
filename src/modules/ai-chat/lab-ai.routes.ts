import { Router } from "express";
import { validateRequest } from "@/middleware/validation";
import {
  getLabAiChatStatus,
  isLabAiEnabled,
  labChatWithAi,
} from "./ai-chat.controller";
import {
  labAiEnabledQuerySchema,
  labChatBodySchema,
  labChatStatusQuerySchema,
} from "./ai-chat.schema";

const router = Router();

router.get(
  "/isenabled",
  validateRequest({ query: labAiEnabledQuerySchema }),
  isLabAiEnabled,
);
router.post(
  "/chat",
  validateRequest({ body: labChatBodySchema }),
  labChatWithAi,
);
router.get(
  "/chat/status",
  validateRequest({ query: labChatStatusQuerySchema }),
  getLabAiChatStatus,
);

export default router;
