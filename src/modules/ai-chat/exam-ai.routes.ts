import { Router } from "express";
import { validateRequest } from "@/middleware/validation";
import {
  chatWithAi,
  getAiChatStatus,
  isAiEnabledAndGetGroupId,
} from "./ai-chat.controller";
import {
  examAiEnabledQuerySchema,
  examChatBodySchema,
  examChatStatusQuerySchema,
} from "./ai-chat.schema";

const router = Router();

router.get(
  "/isenabledandgetgroupid",
  validateRequest({ query: examAiEnabledQuerySchema }),
  isAiEnabledAndGetGroupId,
);
router.post(
  "/chat",
  validateRequest({ body: examChatBodySchema }),
  chatWithAi,
);
router.get(
  "/chat/status",
  validateRequest({ query: examChatStatusQuerySchema }),
  getAiChatStatus,
);

export default router;
