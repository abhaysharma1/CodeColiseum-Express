import { z } from "zod";

const id = (message: string) => z.string().trim().min(1, message);

export const examAiEnabledQuerySchema = z.object({
  examId: id("examId is required"),
});

export const examChatBodySchema = z.object({
  groupId: id("groupId is required"),
  examId: id("examId is required"),
  problemId: id("problemId is required"),
  message: z.string().min(1, "message is required"),
  language: z.string().optional(),
});

export const examChatStatusQuerySchema = z.object({
  examId: id("examId is required"),
  problemId: id("problemId is required"),
});

export const labAiEnabledQuerySchema = z.object({
  moduleProblemId: id("moduleProblemId is required"),
});

export const labChatBodySchema = z.object({
  labId: id("labId is required"),
  problemId: id("problemId is required"),
  message: z.string().min(1, "message is required"),
  language: z.string().optional(),
});

export const labChatStatusQuerySchema = z.object({
  labId: id("labId is required"),
  problemId: id("problemId is required"),
});

export type ExamChatBody = z.infer<typeof examChatBodySchema>;
export type LabChatBody = z.infer<typeof labChatBodySchema>;
