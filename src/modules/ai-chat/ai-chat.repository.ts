import prisma from "@/infrastructure/database/prisma";
import { runInTransaction } from "@/infrastructure/database/transactions";

export async function findExamAiGroup(examId: string, userId: string) {
  return prisma.group.findFirst({
    where: {
      examGroups: {
        some: { examId },
      },
      members: {
        some: { userId },
      },
      aiEnabled: true,
    },
    select: { id: true },
  });
}

export async function findProblemForAi(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, title: true, description: true },
  });
}

export async function findGroupForAi(groupId: string, userId: string) {
  return prisma.group.findUnique({
    where: {
      id: groupId,
      members: {
        some: { userId },
      },
    },
    select: {
      id: true,
      aiEnabled: true,
      aiMaxMessages: true,
      aiMaxTokens: true,
    },
  });
}

export async function findExamForAi(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, endDate: true },
  });
}

export async function autoSubmitExpiredAttempt(
  examId: string,
  userId: string,
) {
  return prisma.examAttempt.updateMany({
    where: {
      examId,
      studentId: userId,
      status: { in: ["IN_PROGRESS", "NOT_STARTED"] },
    },
    data: { status: "AUTO_SUBMITTED" },
  });
}

export async function findExamConversation(params: {
  studentId: string;
  examId: string;
  problemId: string;
}) {
  return prisma.aIConversation.findUnique({
    where: {
      studentId_examId_problemId: params,
    },
  });
}

export async function createExamConversation(params: {
  studentId: string;
  groupId: string;
  examId: string;
  problemId: string;
}) {
  return prisma.aIConversation.create({ data: params });
}

export async function findLabConversation(params: {
  studentId: string;
  labId: string;
  problemId: string;
}) {
  return prisma.aIConversation.findUnique({
    where: {
      studentId_labId_problemId: params,
    },
  });
}

export async function createLabConversation(params: {
  studentId: string;
  labId: string;
  problemId: string;
}) {
  return prisma.aIConversation.create({ data: params });
}

export async function findLabForAi(labId: string) {
  return prisma.lab.findUnique({
    where: { id: labId },
    select: {
      id: true,
      aiEnabled: true,
      aiMaxMessages: true,
      aiMaxTokens: true,
    },
  });
}

export async function findModuleProblemLab(moduleProblemId: string) {
  return prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
    select: {
      id: true,
      module: {
        select: {
          lab: {
            select: {
              id: true,
              aiEnabled: true,
              aiMaxMessages: true,
              aiMaxTokens: true,
            },
          },
        },
      },
    },
  });
}

export async function findRateLimit(studentId: string, problemId: string) {
  return prisma.aIRateLimit.findUnique({
    where: {
      studentId_problemId: { studentId, problemId },
    },
  });
}

export async function createRateLimit(params: {
  studentId: string;
  problemId: string;
  lastRequest: Date;
}) {
  return prisma.aIRateLimit.create({ data: params });
}

export async function touchRateLimit(id: string, lastRequest: Date) {
  return prisma.aIRateLimit.update({
    where: { id },
    data: { lastRequest },
  });
}

/**
 * Persists the user message and the conversation counter atomically.
 */
export async function persistUserMessage(params: {
  conversationId: string;
  content: string;
}) {
  return runInTransaction(async (tx) => {
    const message = await tx.aIMessage.create({
      data: {
        conversationId: params.conversationId,
        role: "USER",
        content: params.content,
      },
    });

    await tx.aIConversation.update({
      where: { id: params.conversationId },
      data: { messageCount: { increment: 1 } },
    });

    return message;
  });
}

export async function findRecentMessages(conversationId: string, take = 5) {
  return prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
