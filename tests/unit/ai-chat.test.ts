import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ai-chat/ai-chat.repository", () => ({
  findExamAiGroup: vi.fn(),
  findProblemForAi: vi.fn(),
  findGroupForAi: vi.fn(),
  findExamForAi: vi.fn(),
  autoSubmitExpiredAttempt: vi.fn(),
  findExamConversation: vi.fn(),
  createExamConversation: vi.fn(),
  findLabConversation: vi.fn(),
  createLabConversation: vi.fn(),
  findLabForAi: vi.fn(),
  findModuleProblemLab: vi.fn(),
  findRateLimit: vi.fn(),
  createRateLimit: vi.fn(),
  touchRateLimit: vi.fn(),
  persistUserMessage: vi.fn(),
  findRecentMessages: vi.fn(),
}));

vi.mock("@/modules/labs/lab.service", () => ({
  getStudentLabIds: vi.fn(),
}));

vi.mock("@/utils/sqs", () => ({
  sendAiChatToSQS: vi.fn(),
}));

import * as repositoryModule from "@/modules/ai-chat/ai-chat.repository";
import * as labServiceModule from "@/modules/labs/lab.service";
import * as sqsModule from "@/utils/sqs";
import {
  chatWithExamAi,
  chatWithLabAi,
  getExamAiAvailability,
  getLabAiAvailability,
} from "@/modules/ai-chat/ai-chat.service";
import {
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from "@/shared/errors";

const repository = vi.mocked(repositoryModule);
const labService = vi.mocked(labServiceModule);
const sqs = vi.mocked(sqsModule);

const now = new Date("2026-01-10T12:00:00Z");

const futureExam = { id: "exam-1", endDate: new Date("2026-01-11T12:00:00Z") };

const baseConversation = {
  id: "conversation-1",
  messageCount: 0,
  totalTokens: 0,
  isClosed: false,
};

function mockExamChatHappyPath() {
  repository.findProblemForAi.mockResolvedValue({
    id: "problem-1",
    title: "Two Sum",
    description: "…",
  } as never);
  repository.findGroupForAi.mockResolvedValue({
    id: "group-1",
    aiEnabled: true,
    aiMaxMessages: null,
    aiMaxTokens: null,
  });
  repository.findExamForAi.mockResolvedValue(futureExam as never);
  repository.findExamConversation.mockResolvedValue(
    baseConversation as never,
  );
  repository.findRateLimit.mockResolvedValue(null);
  repository.createRateLimit.mockResolvedValue({} as never);
  repository.persistUserMessage.mockResolvedValue({} as never);
  sqs.sendAiChatToSQS.mockResolvedValue(undefined);
}

describe("exam AI availability", () => {
  beforeEach(() => {
    repository.findExamAiGroup.mockReset();
  });

  it("returns disabled instead of crashing when the student has no AI group", async () => {
    repository.findExamAiGroup.mockResolvedValue(null);

    await expect(
      getExamAiAvailability("student-1", "exam-1"),
    ).resolves.toEqual({ enabled: false });
  });

  it("returns the group id when AI is enabled", async () => {
    repository.findExamAiGroup.mockResolvedValue({ id: "group-1" } as never);

    await expect(
      getExamAiAvailability("student-1", "exam-1"),
    ).resolves.toEqual({ enabled: true, groupId: "group-1" });
  });
});

describe("exam AI chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the first message (new rate-limit row)", async () => {
    mockExamChatHappyPath();

    await expect(
      chatWithExamAi({
        userId: "student-1",
        body: {
          groupId: "group-1",
          examId: "exam-1",
          problemId: "problem-1",
          message: "Help",
        },
        now,
      }),
    ).resolves.toEqual({ status: "PROCESSING" });

    expect(repository.createRateLimit).toHaveBeenCalledTimes(1);
    expect(repository.persistUserMessage).toHaveBeenCalledTimes(1);
    expect(sqs.sendAiChatToSQS).toHaveBeenCalledWith("conversation-1");
  });

  it("enforces the cooldown for existing requests", async () => {
    mockExamChatHappyPath();
    repository.findRateLimit.mockResolvedValue({
      id: "rate-1",
      lastRequest: new Date(now.getTime() - 3_000),
    } as never);

    await expect(
      chatWithExamAi({
        userId: "student-1",
        body: {
          groupId: "group-1",
          examId: "exam-1",
          problemId: "problem-1",
          message: "Help",
        },
        now,
      }),
    ).rejects.toBeInstanceOf(TooManyRequestsError);

    expect(repository.persistUserMessage).not.toHaveBeenCalled();
  });

  it("treats null quota fields as unlimited", async () => {
    mockExamChatHappyPath();
    repository.findExamConversation.mockResolvedValue({
      ...baseConversation,
      messageCount: 100,
      totalTokens: 10_000,
    } as never);

    await expect(
      chatWithExamAi({
        userId: "student-1",
        body: {
          groupId: "group-1",
          examId: "exam-1",
          problemId: "problem-1",
          message: "Help",
        },
        now,
      }),
    ).resolves.toEqual({ status: "PROCESSING" });
  });

  it("stops when the exam has ended", async () => {
    mockExamChatHappyPath();
    repository.findExamForAi.mockResolvedValue({
      id: "exam-1",
      endDate: new Date("2026-01-09T12:00:00Z"),
    } as never);

    await expect(
      chatWithExamAi({
        userId: "student-1",
        body: {
          groupId: "group-1",
          examId: "exam-1",
          problemId: "problem-1",
          message: "Help",
        },
        now,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(repository.autoSubmitExpiredAttempt).toHaveBeenCalled();
  });

  it("rejects a missing problem", async () => {
    repository.findProblemForAi.mockResolvedValue(null);

    await expect(
      chatWithExamAi({
        userId: "student-1",
        body: {
          groupId: "group-1",
          examId: "exam-1",
          problemId: "missing",
          message: "Help",
        },
        now,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("lab AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NOT_FOUND for an unknown module problem", async () => {
    repository.findModuleProblemLab.mockResolvedValue(null);

    await expect(
      getLabAiAvailability("student-1", "module-problem-1"),
    ).resolves.toEqual({ outcome: "NOT_FOUND" });
  });

  it("reports a disabled lab without hiding it", async () => {
    repository.findModuleProblemLab.mockResolvedValue({
      module: {
        lab: {
          id: "lab-1",
          aiEnabled: false,
          aiMaxMessages: 5,
          aiMaxTokens: 1000,
        },
      },
    } as never);
    labService.getStudentLabIds.mockResolvedValue(["lab-1"]);

    await expect(
      getLabAiAvailability("student-1", "module-problem-1"),
    ).resolves.toEqual({
      outcome: "OK",
      enabled: false,
      labId: "lab-1",
      aiMaxMessages: 5,
      aiMaxTokens: 1000,
    });
  });

  it("rejects chat when the lab is not assigned to the student", async () => {
    repository.findProblemForAi.mockResolvedValue({ id: "problem-1" } as never);
    repository.findLabForAi.mockResolvedValue({
      id: "lab-1",
      aiEnabled: true,
      aiMaxMessages: 5,
      aiMaxTokens: 1000,
    } as never);
    labService.getStudentLabIds.mockResolvedValue([]);

    await expect(
      chatWithLabAi({
        userId: "student-1",
        body: {
          labId: "lab-1",
          problemId: "problem-1",
          message: "Help",
        },
        now,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(repository.persistUserMessage).not.toHaveBeenCalled();
  });
});
