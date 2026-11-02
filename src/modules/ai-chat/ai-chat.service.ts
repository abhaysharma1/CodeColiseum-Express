import { logger } from "@/config/logger";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from "@/shared/errors";
import { sendAiChatToSQS } from "@/utils/sqs";
import { getStudentLabIds } from "@/modules/labs/lab.service";
import * as aiChatRepository from "./ai-chat.repository";
import type { ExamChatBody, LabChatBody } from "./ai-chat.schema";

const RATE_LIMIT_SECONDS = 8;

export interface ExamAiAvailability {
  enabled: boolean;
  groupId?: string;
}

export type LabAiAvailability =
  | { outcome: "NOT_FOUND" }
  | { outcome: "FORBIDDEN" }
  | {
      outcome: "OK";
      enabled: boolean;
      labId: string;
      aiMaxMessages: number | null;
      aiMaxTokens: number | null;
    };

interface ConversationLimits {
  aiMaxMessages: number | null;
  aiMaxTokens: number | null;
}

function assertQuotaAvailable(
  conversation: { messageCount: number; totalTokens: number },
  limits: ConversationLimits,
): void {
  const messageQuotaExceeded =
    limits.aiMaxMessages !== null &&
    conversation.messageCount >= limits.aiMaxMessages;
  const tokenQuotaExceeded =
    limits.aiMaxTokens !== null && conversation.totalTokens >= limits.aiMaxTokens;

  if (messageQuotaExceeded || tokenQuotaExceeded) {
    throw new TooManyRequestsError(
      "AI Quota Exceeded For this Conversation",
    );
  }
}

/**
 * Enforces the per-student/per-problem cooldown. A newly created limit is
 * treated as the first allowed request (the legacy code created the row and
 * immediately rejected the first message).
 */
async function enforceRateLimit(params: {
  userId: string;
  problemId: string;
  now: Date;
}): Promise<void> {
  const existing = await aiChatRepository.findRateLimit(
    params.userId,
    params.problemId,
  );

  if (!existing) {
    await aiChatRepository.createRateLimit({
      studentId: params.userId,
      problemId: params.problemId,
      lastRequest: params.now,
    });
    return;
  }

  const secondsSinceLastRequest =
    (params.now.getTime() - existing.lastRequest.getTime()) / 1000;

  if (secondsSinceLastRequest < RATE_LIMIT_SECONDS) {
    throw new TooManyRequestsError("Rate Limit Exceeded");
  }

  await aiChatRepository.touchRateLimit(existing.id, params.now);
}

async function enqueueConversation(conversationId: string): Promise<void> {
  try {
    await sendAiChatToSQS(conversationId);
  } catch (error) {
    logger.error("failed to enqueue AI chat job", {
      conversationId,
      reason: error instanceof Error ? error.message : error,
    });
    throw new AppError("Couldn't enqueue AI chat job", 500, {
      code: "INTERNAL_SERVER_ERROR",
      cause: error,
    });
  }
}

async function getConversationState(conversationId: string) {
  const messages = await aiChatRepository.findRecentMessages(conversationId);

  if (messages.length === 0) {
    return { status: "IDLE" as const };
  }

  const lastUserMessage = messages.find((message) => message.role === "USER");
  const lastAssistantMessage = messages.find(
    (message) => message.role === "ASSISTANT",
  );

  if (!lastUserMessage) {
    return { status: "IDLE" as const };
  }

  if (
    !lastAssistantMessage ||
    lastAssistantMessage.createdAt < lastUserMessage.createdAt
  ) {
    return { status: "PROCESSING" as const };
  }

  return {
    status: "COMPLETED" as const,
    message: {
      id: lastAssistantMessage.id,
      role: lastAssistantMessage.role.toLowerCase(),
      content: lastAssistantMessage.content,
      createdAt: lastAssistantMessage.createdAt,
    },
  };
}

export async function getExamAiAvailability(
  userId: string,
  examId: string,
): Promise<ExamAiAvailability> {
  const group = await aiChatRepository.findExamAiGroup(examId, userId);

  // The legacy implementation crashed with a 500 when no group existed.
  if (!group) {
    return { enabled: false };
  }

  return { enabled: true, groupId: group.id };
}

export async function chatWithExamAi(params: {
  userId: string;
  body: ExamChatBody;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  const problem = await aiChatRepository.findProblemForAi(
    params.body.problemId,
  );
  if (!problem) {
    throw new NotFoundError("Couldn't Find Problem");
  }

  const group = await aiChatRepository.findGroupForAi(
    params.body.groupId,
    params.userId,
  );
  if (!group) {
    throw new NotFoundError("Cannot Find Group");
  }

  if (!group.aiEnabled) {
    throw new ForbiddenError("Ai is Not Enabled for this Group");
  }

  const exam = await aiChatRepository.findExamForAi(params.body.examId);
  if (!exam) {
    throw new NotFoundError("Cannot Find Exam");
  }

  if (exam.endDate < now) {
    await aiChatRepository.autoSubmitExpiredAttempt(
      exam.id,
      params.userId,
    );
    throw new ForbiddenError("Exam has Ended");
  }

  let conversation = await aiChatRepository.findExamConversation({
    studentId: params.userId,
    examId: exam.id,
    problemId: problem.id,
  });

  if (!conversation) {
    conversation = await aiChatRepository.createExamConversation({
      studentId: params.userId,
      groupId: group.id,
      examId: exam.id,
      problemId: problem.id,
    });
  }

  assertQuotaAvailable(conversation, {
    aiMaxMessages: group.aiMaxMessages,
    aiMaxTokens: group.aiMaxTokens,
  });

  if (conversation.isClosed) {
    throw new ConflictError("Conversation has been Closed");
  }

  await enforceRateLimit({
    userId: params.userId,
    problemId: problem.id,
    now,
  });

  await aiChatRepository.persistUserMessage({
    conversationId: conversation.id,
    content:
      "User Message: " +
      params.body.message +
      "\n" +
      "Code Language: " +
      (params.body.language ?? ""),
  });

  await enqueueConversation(conversation.id);

  return { status: "PROCESSING" as const };
}

export async function getExamAiStatus(params: {
  userId: string;
  examId: string;
  problemId: string;
}) {
  const conversation = await aiChatRepository.findExamConversation({
    studentId: params.userId,
    examId: params.examId,
    problemId: params.problemId,
  });

  if (!conversation) {
    throw new NotFoundError("No Conversation Exists");
  }

  if (conversation.isClosed) {
    throw new ConflictError("Conversation has been closed");
  }

  return getConversationState(conversation.id);
}

export async function getLabAiAvailability(
  userId: string,
  moduleProblemId: string,
): Promise<LabAiAvailability> {
  const moduleProblem =
    await aiChatRepository.findModuleProblemLab(moduleProblemId);

  if (!moduleProblem) {
    return { outcome: "NOT_FOUND" };
  }

  const lab = moduleProblem.module.lab;
  const studentLabIds = await getStudentLabIds(userId);

  if (!studentLabIds.includes(lab.id)) {
    return { outcome: "FORBIDDEN" };
  }

  return {
    outcome: "OK",
    enabled: lab.aiEnabled,
    labId: lab.id,
    aiMaxMessages: lab.aiMaxMessages,
    aiMaxTokens: lab.aiMaxTokens,
  };
}

export async function chatWithLabAi(params: {
  userId: string;
  body: LabChatBody;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  const problem = await aiChatRepository.findProblemForAi(
    params.body.problemId,
  );
  if (!problem) {
    throw new NotFoundError("Couldn't Find Problem");
  }

  const lab = await aiChatRepository.findLabForAi(params.body.labId);
  if (!lab) {
    throw new NotFoundError("Cannot Find Lab");
  }

  const studentLabIds = await getStudentLabIds(params.userId);
  if (!studentLabIds.includes(lab.id)) {
    throw new ForbiddenError("Lab is not assigned to this student");
  }

  if (!lab.aiEnabled) {
    throw new ForbiddenError("AI is Not Enabled for this Lab");
  }

  let conversation = await aiChatRepository.findLabConversation({
    studentId: params.userId,
    labId: lab.id,
    problemId: problem.id,
  });

  if (!conversation) {
    conversation = await aiChatRepository.createLabConversation({
      studentId: params.userId,
      labId: lab.id,
      problemId: problem.id,
    });
  }

  assertQuotaAvailable(conversation, {
    aiMaxMessages: lab.aiMaxMessages,
    aiMaxTokens: lab.aiMaxTokens,
  });

  if (conversation.isClosed) {
    throw new ConflictError("Conversation has been Closed");
  }

  await enforceRateLimit({
    userId: params.userId,
    problemId: problem.id,
    now,
  });

  await aiChatRepository.persistUserMessage({
    conversationId: conversation.id,
    content:
      "User Message: " +
      params.body.message +
      "\n" +
      "Code Language: " +
      (params.body.language ?? ""),
  });

  await enqueueConversation(conversation.id);

  return { status: "PROCESSING" as const };
}

export async function getLabAiStatus(params: {
  userId: string;
  labId: string;
  problemId: string;
}) {
  const studentLabIds = await getStudentLabIds(params.userId);

  if (!studentLabIds.includes(params.labId)) {
    throw new ForbiddenError("Lab is not assigned to this student");
  }

  const conversation = await aiChatRepository.findLabConversation({
    studentId: params.userId,
    labId: params.labId,
    problemId: params.problemId,
  });

  if (!conversation) {
    throw new NotFoundError("No Conversation Exists");
  }

  if (conversation.isClosed) {
    throw new ConflictError("Conversation has been closed");
  }

  return getConversationState(conversation.id);
}
