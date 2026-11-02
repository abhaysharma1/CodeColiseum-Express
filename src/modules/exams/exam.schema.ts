import { z } from "zod";

const examIdField = z.string().trim().min(1, "Exam ID is required");
const problemIdField = z.string().trim().min(1, "Problem ID is required");

export const examIdBodySchema = z.object({
  examId: examIdField,
});

export const examIdQuerySchema = z.object({
  examId: examIdField,
});

export const problemDescriptionQuerySchema = z.object({
  problemId: problemIdField,
});

export const examRunCodeBodySchema = z.object({
  examId: examIdField,
  problemId: problemIdField,
  sourceCode: z.string().min(1, "sourceCode is required"),
  languageId: z.number().int().positive("languageId is required"),
});

export const examSubmissionsQuerySchema = z.object({
  attemptId: z.string().trim().min(1, "attemptId and problemId are required"),
  problemId: problemIdField,
});

export const testCasesQuerySchema = z.object({
  questionId: z.string().trim().min(1, "questionId is required"),
});

export const submissionStatusParamsSchema = z.object({
  submissionId: z.string().trim().min(1, "submissionId is required"),
});

export type ExamRunCodeBody = z.infer<typeof examRunCodeBodySchema>;
export type ExamSubmissionsQuery = z.infer<
  typeof examSubmissionsQuerySchema
>;
