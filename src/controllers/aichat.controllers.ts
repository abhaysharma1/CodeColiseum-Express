import prisma from "@/utils/prisma";
import { CloudTasksClient } from "@google-cloud/tasks";
import { NextFunction, Request, Response } from "express";

export const chatWithAi = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const { groupId, examId, problemId, message, code, language } = req.body;
    const now = new Date();
    const MAX_CODE_LENGTH = 3000;
    const RATE_LIMIT = 8; // seconds

    const problem = await prisma.problem.findUnique({
      where: {
        id: problemId,
      },
      select: {
        id: true,
        title: true,
        description: true,
      },
    });

    if (!problem) {
      throw new Error("Couldn't Find Problem");
    }

    const group = await prisma.group.findUnique({
      where: {
        id: groupId,
        members: {
          some: {
            studentId: user.id,
          },
        },
      },
      select: {
        id: true,
        aiEnabled: true,
        aiMaxMessages: true,
        aiMaxTokens: true,
      },
    });

    if (!group) {
      throw new Error("Cannot Find Group");
    }

    if (!group.aiEnabled) {
      throw new Error("Ai is Not Enabled for this Group");
    }

    const exam = await prisma.exam.findUnique({
      where: {
        id: examId,
      },
      select: {
        id: true,
        endDate: true,
      },
    });

    if (!exam) {
      throw new Error("Cannot Find Exam");
    }

    if (exam.endDate < now) {
      await prisma.examAttempt.update({
        where: {
          examId_studentId: {
            studentId: String(user.id),
            examId: examId,
          },
        },
        data: {
          status: "AUTO_SUBMITTED",
        },
      });
      throw new Error("Exam has Ended");
    }

    let convo = await prisma.aIConversation.findUnique({
      where: {
        studentId_examId_problemId: {
          studentId: user.id,
          examId: exam.id,
          problemId: problem.id,
        },
      },
    });

    if (!convo) {
      convo = await prisma.aIConversation.create({
        data: {
          studentId: user.id,
          groupId: group.id,
          examId: exam.id,
          problemId: problem.id,
        },
      });
    }

    if (
      convo.messageCount >= group.aiMaxMessages! ||
      convo.totalTokens >= group.aiMaxTokens!
    ) {
      throw new Error("AI Quota Exceeded For this Conversation");
    }

    if (convo.isClosed) {
      throw new Error("Conversation has been Closed");
    }

    const trimmedCode = String(code).slice(0, MAX_CODE_LENGTH);

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
      where: {
        id: aiLimit.id,
      },
      data: {
        lastRequest: now,
      },
    });

    const userMSG = await prisma.aIMessage.create({
      data: {
        conversationId: convo.id,
        role: "USER",
        content:
          "User Message: " +
          message +
          "\n" +
          "Code Language: " +
          language +
          "\n" +
          "Current Code: " +
          trimmedCode,
      },
    });

    await prisma.aIConversation.update({
      where: { id: convo.id },
      data: {
        messageCount: { increment: 1 },
      },
    });

    const tasksClient = new CloudTasksClient();

    const project = process.env.GCP_PROJECT!;
    const location = process.env.GCP_LOCATION!;
    const queueName = process.env.AI_REVIEW_QUEUE_NAME!;
    const workerUrl = process.env.AI_WORKER_URL!;
    const serviceAccountEmail = process.env.AI_TASK_SERVICE_ACCOUNT_EMAIL!;

    const queuePath = tasksClient.queuePath(project, location, queueName);

    const jobId = crypto.randomUUID();

    const payload = {
      conversationId: convo.id,
    };

    const task = {
      httpRequest: {
        httpMethod: "POST" as const,
        url: `${workerUrl}/ai-chat-worker`,
        headers: {
          "Content-Type": "application/json",
        },
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
        oidcToken: {
          serviceAccountEmail,
          audience: `${workerUrl}/ai-chat-worker`,
        },
      },
    };

    try {
      await tasksClient.createTask({
        parent: queuePath,
        task,
      });
    } catch (error) {
      console.log(error);
      throw new Error("Couldn't create Task");
    }

    return res.status(201).json({ status: "PROCESSING" });
  } catch (error) {
    next(error);
  }
};

export const getAiChatStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const { examId, problemId } = req.query;

    const convo = await prisma.aIConversation.findUnique({
      where: {
        studentId_examId_problemId: {
          studentId: user.id,
          examId: String(examId),
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

    // Find latest USER and ASSISTANT messages
    const lastUserMessage = messages.find((m) => m.role === "USER");
    const lastAssistantMessage = messages.find((m) => m.role === "ASSISTANT");

    // If no user message yet
    if (!lastUserMessage) {
      return res.status(200).json({ status: "IDLE" });
    }

    // If assistant hasn't responded yet
    if (
      !lastAssistantMessage ||
      lastAssistantMessage.createdAt < lastUserMessage.createdAt
    ) {
      return res.status(200).json({ status: "PROCESSING" });
    }

    // Assistant has responded to latest user message
    return res.status(200).json({
      status: "COMPLETED",
      message: {
        id: lastAssistantMessage.id,
        content: lastAssistantMessage.content,
        createdAt: lastAssistantMessage.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};
