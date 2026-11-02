import { z } from "zod";

export const listProblemsQuerySchema = z.object({
  searchValue: z.string().trim().optional(),
  tags: z.string().trim().optional(),
  difficulty: z.string().trim().optional(),
  take: z.coerce.number().int().min(1).max(1000).default(10),
  skip: z.coerce.number().int().min(0).default(0),
});

export const problemIdParamSchema = z.object({
  id: z.string().trim().min(1, "Problem ID is required"),
});

export const testCasesQuerySchema = z.object({
  id: z.string().trim().min(1, "Question ID is required"),
});

export const submissionsBodySchema = z.object({
  problemId: z.string().trim().min(1, "problemId is required"),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
});

export const templateCodeBodySchema = z.object({
  problemId: z.string().trim().min(1, "problemId is required"),
  language: z.string().trim().optional(),
  languageId: z.union([z.number().int(), z.string()]).optional(),
});

export const runCodeBodySchema = z.object({
  questionId: z.string().trim().min(1, "questionId and code are required"),
  code: z.string().min(1, "questionId and code are required"),
  language: z.string().trim().optional(),
  languageId: z.union([z.number().int(), z.string()]).optional(),
  moduleProblemId: z.string().trim().optional(),
});

export const submissionStatusParamsSchema = z.object({
  submissionId: z.string().trim().min(1, "submissionId is required"),
});

export const submissionStatusQuerySchema = z.object({
  moduleProblemId: z.string().trim().optional(),
});

export type ListProblemsQuery = z.infer<typeof listProblemsQuerySchema>;
export type SubmissionsBody = z.infer<typeof submissionsBodySchema>;
export type TemplateCodeBody = z.infer<typeof templateCodeBodySchema>;
export type RunCodeBody = z.infer<typeof runCodeBodySchema>;
export type SubmissionStatusQuery = z.infer<
  typeof submissionStatusQuerySchema
>;
