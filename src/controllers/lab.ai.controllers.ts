import prisma from "@/utils/prisma";
import { sendAiChatToSQS } from "@/utils/sqs";
import { NextFunction, Request, Response } from "express";

export const isLabAiEnabled = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const { moduleProblemId } = req.query;

    const moduleProblem = await prisma.moduleProblem.findUnique({
      where: { id: String(moduleProblemId) },
      include: {
        module: {
          include: { lab: true },
        },
      },
    });

    if (!moduleProblem) {
      return res.status(404).json({ enabled: false });
    }

    const lab = moduleProblem.module.lab;
    const labIds = await getStudentLabIds(user.id);

    if (!labIds.includes(lab.id)) {
      return res.status(403).json({ enabled: false });
    }

    return res.status(200).json({
      enabled: lab.aiEnabled,
      labId: lab.id,
      aiMaxMessages: lab.aiMaxMessages,
      aiMaxTokens: lab.aiMaxTokens,
    });
  } catch (error) {
    next(error);
  }
};

export const labChatWithAi = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const { labId, problemId, message, language } = req.body;
    const now = new Date();
    const RATE_LIMIT = 8;

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, title: true, description: true },
    });

    if (!problem) {
      throw new Error("Couldn't Find Problem");
    }

    const lab = await prisma.lab.findUnique({
      where: { id: labId },
      select: {
        id: true,
        aiEnabled: true,
        aiMaxMessages: true,
        aiMaxTokens: true,
      },
    });

    if (!lab) {
      throw new Error("Cannot Find Lab");
    }

    if (!lab.aiEnabled) {
      throw new Error("AI is Not Enabled for this Lab");
    }

    let convo = await prisma.aIConversation.findUnique({
      where: {
        studentId_labId_problemId: {
          studentId: user.id,
          labId: lab.id,
          problemId: problem.id,
        },
      },
    });

    if (!convo) {
      convo = await prisma.aIConversation.create({
        data: {
          studentId: user.id,
          labId: lab.id,
          problemId: problem.id,
        },
      });
    }

    if (
      convo.messageCount >= lab.aiMaxMessages! ||
      convo.totalTokens >= lab.aiMaxTokens!
    ) {
      throw new Error("AI Quota Exceeded For this Conversation");
    }

    if (convo.isClosed) {
      throw new Error("Conversation has been Closed");
    }

    let aiLimit;

    aiLimit = await prisma.aIRateLimit.findUnique({
      where: {
        studentId_problemId: {
          studentId: user.id,
          problemId: problem.id,
        },
      },
    });
    if (!aiLimit) {
      aiLimit = await prisma.aIRateLimit.create({
        data: {
          studentId: user.id,
          problemId: problemId,
          lastRequest: now,
        },
      });
    }

    const secondsSinceLastRequest =
      (now.getTime() - aiLimit.lastRequest.getTime()) / 1000;

    if (secondsSinceLastRequest < RATE_LIMIT) {
      throw new Error("Rate Limit Exceeded");
    }

    await prisma.aIRateLimit.update({
      where: { id: aiLimit.id },
      data: { lastRequest: now },
    });

    await prisma.aIMessage.create({
      data: {
        conversationId: convo.id,
        role: "USER",
        content: "User Message: " + message + "\n" + "Code Language: " + language,
      },
    });

    await prisma.aIConversation.update({
      where: { id: convo.id },
      data: { messageCount: { increment: 1 } },
    });

    try {
      await sendAiChatToSQS(convo.id);
    } catch (error) {
      throw new Error("Couldn't enqueue AI chat job");
    }

    return res.status(201).json({ status: "PROCESSING" });
  } catch (error) {
    next(error);
  }
};

export const getLabAiChatStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const { labId, problemId } = req.query;

    const convo = await prisma.aIConversation.findUnique({
      where: {
        studentId_labId_problemId: {
          studentId: user.id,
          labId: String(labId),
          problemId: String(problemId),
        },
      },
    });

    if (!convo) {
      throw new Error("No Conversation Exists");
    }

    if (convo.isClosed) {
      throw new Error("Conversation has been closed");
    }

    const messages = await prisma.aIMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    if (!messages.length) {
      return res.status(200).json({ status: "IDLE" });
    }

    const lastUserMessage = messages.find((m) => m.role === "USER");
    const lastAssistantMessage = messages.find((m) => m.role === "ASSISTANT");

    if (!lastUserMessage) {
      return res.status(200).json({ status: "IDLE" });
    }

    if (
      !lastAssistantMessage ||
      lastAssistantMessage.createdAt < lastUserMessage.createdAt
    ) {
      return res.status(200).json({ status: "PROCESSING" });
    }

    return res.status(200).json({
      status: "COMPLETED",
      message: {
        id: lastAssistantMessage.id,
        role: lastAssistantMessage.role.toLowerCase(),
        content: lastAssistantMessage.content,
        createdAt: lastAssistantMessage.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

async function getStudentLabIds(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return [];
  const assignments = await prisma.labAssignment.findMany({
    where: { groupId: { in: groupIds } },
    select: { labId: true },
  });
  return [...new Set<string>(assignments.map((a) => a.labId))];
}
