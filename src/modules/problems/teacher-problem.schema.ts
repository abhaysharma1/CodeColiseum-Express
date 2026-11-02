import { z } from "zod";
import {
  isSupportedLanguageKey,
  supportedLanguageKeys,
} from "@/utils/languageCatalog";

export const problemLanguageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => isSupportedLanguageKey(value), {
    message: "Unsupported language",
  });

const testCaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  output: z.string(),
});

const testCasesSchema = z.object({
  public: z.array(testCaseSchema).default([]),
  hidden: z.array(testCaseSchema).default([]),
});

const driverCodeEntrySchema = z.object({
  header: z.string().optional().default(""),
  template: z.string().optional().default(""),
  footer: z.string().optional().default(""),
});

const driverCodeSchema = z.record(z.string(), driverCodeEntrySchema);

const solutionSchema = z.object({
  id: z.string(),
  language: problemLanguageSchema,
  code: z.string(),
});

const defaultDriverCode = Object.fromEntries(
  supportedLanguageKeys.map((language) => [
    language,
    { header: "", template: "", footer: "" },
  ]),
) as Record<string, { header: string; template: string; footer: string }>;

export const createTeacherProblemSchema = z.object({
  title: z.string().min(1).max(300),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  tags: z.array(z.string()).default([]),
  description: z.string().optional().default(""),
  testCases: testCasesSchema.optional().default({ public: [], hidden: [] }),
  driverCode: driverCodeSchema.optional().default(defaultDriverCode),
  solutions: z.array(solutionSchema).optional().default([]),
  status: z.enum(["DRAFT", "SUBMIT"]).default("DRAFT"),
});

export const updateTeacherProblemSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  testCases: testCasesSchema.optional(),
  driverCode: driverCodeSchema.optional(),
  solutions: z.array(solutionSchema).optional(),
  status: z.enum(["DRAFT", "SUBMIT"]).optional(),
});

export const myProblemsQuerySchema = z.object({
  searchValue: z.string().trim().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  take: z.coerce.number().int().min(1).max(100).default(10),
  skip: z.coerce.number().int().min(0).default(0),
});

export const problemIdParamSchema = z.object({
  id: z.string().trim().min(1, "Problem id is required"),
});

export const runReferenceSolutionSchema = z.object({
  languageId: z.number().int().optional(),
  code: z.string(),
  cases: z.array(z.object({ input: z.string(), output: z.string() })).default([]),
});

export type CreateTeacherProblemInput = z.infer<
  typeof createTeacherProblemSchema
>;
export type UpdateTeacherProblemInput = z.infer<
  typeof updateTeacherProblemSchema
>;
export type MyProblemsQuery = z.infer<typeof myProblemsQuerySchema>;
export type RunReferenceSolutionInput = z.infer<
  typeof runReferenceSolutionSchema
>;
export type ProblemTestCase = z.infer<typeof testCaseSchema>;
export type DriverCodeEntry = z.infer<typeof driverCodeEntrySchema>;
export type ProblemSolution = z.infer<typeof solutionSchema>;
