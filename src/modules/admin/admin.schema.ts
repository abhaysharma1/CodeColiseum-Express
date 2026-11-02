import { z } from "zod";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import {
  isSupportedLanguageKey,
  supportedLanguageKeys,
} from "@/utils/languageCatalog";

export const languageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => isSupportedLanguageKey(value), {
    message: "Unsupported language",
  });

export const defaultDriverCode = Object.fromEntries(
  supportedLanguageKeys.map((language) => [
    language,
    { header: "", template: "", footer: "" },
  ]),
) as Record<string, { header: string; template: string; footer: string }>;

const globalRoleIdSchema = z.enum([
  GLOBAL_ROLE_IDS.ORG_STUDENT,
  GLOBAL_ROLE_IDS.ORG_TEACHER,
  GLOBAL_ROLE_IDS.PLATFORM_ADMIN,
]);

const complexityEnum = z.enum(["N", "LOGN", "NLOGN", "N2", "N3", "EXP"]);

/* ----------------------------- Driver code ----------------------------- */

export const driverCodeSchema = z.object({
  problemId: z.string(),
  language: languageSchema.optional(),
  languageId: z.number().int().optional(),
  header: z.string().optional(),
  template: z.string().optional(),
  footer: z.string().optional(),
});

/* ------------------------- Performance limits ------------------------- */

export const performanceConstraintsSchema = z.object({
  problemId: z.string(),
  cppTimeLimitMs: z.number().int().positive().default(1000),
  javaTimeLimitMs: z.number().int().positive().default(2000),
  pythonTimeLimitMs: z.number().int().positive().default(4000),
  jsTimeLimitMs: z.number().int().positive().default(3000),
  memoryLimitMB: z.number().int().positive().default(256),
});

export const problemIdQuerySchema = z.object({
  problemId: z.string().min(1, "Missing problemId"),
});

export const problemIdParamSchema = z.object({
  id: z.string().trim().min(1, "Problem id is required"),
});

export const performanceTestCaseParamSchema = z.object({
  id: z.string().trim().min(1, "Performance test case id is required"),
});

export const createPerformanceTestCaseSchema = z.object({
  problemId: z.string().min(1, "Missing required fields: problemId, name"),
  name: z.string().min(1, "Missing required fields: problemId, name"),
});

/* ------------------------- Bulk problem import ------------------------ */

const problemTestCaseSchema = z.object({
  input: z.string().max(100_000),
  output: z.string().max(100_000),
});

export const bulkProblemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional().default("MEDIUM"),
  source: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  publicTests: z.array(problemTestCaseSchema).optional().default([]),
  hiddenTests: z.array(problemTestCaseSchema).optional().default([]),
  hidden: z.boolean().optional().default(false),
  referenceSolution: z.object({
    language: languageSchema.optional(),
    languageId: z.number().int().optional(),
    code: z.string(),
  }),
});

export const uploadProblemsSchema = z
  .array(bulkProblemSchema)
  .min(1, "Empty Request")
  .max(2000, "Cannot upload more than 2000 problems at once");

/* ---------------------------- Problem editor -------------------------- */

const editorTestCaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  output: z.string(),
});

export const problemEditorSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  tags: z.array(z.string()).default([]),
  description: z.string().optional().default(""),
  testCases: z.object({
    public: z.array(editorTestCaseSchema).default([]),
    hidden: z.array(editorTestCaseSchema).default([]),
  }),
  driverCode: z
    .record(
      z.string(),
      z.object({
        header: z.string().optional().default(""),
        template: z.string().optional().default(""),
        footer: z.string().optional().default(""),
      }),
    )
    .default(defaultDriverCode),
  solutions: z
    .array(
      z.object({
        id: z.string(),
        language: languageSchema,
        code: z.string(),
      }),
    )
    .default([]),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  hidden: z.boolean().optional().default(false),
});

export const toggleHiddenSchema = z.object({
  hidden: z.boolean(),
});

export const togglePublishSchema = z.object({
  isPublished: z.boolean(),
});

export const adminProblemsQuerySchema = z.object({
  searchValue: z.string().optional(),
  take: z.coerce.number().int().min(0).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

export const runReferenceSolutionSchema = z.object({
  languageId: z.number().int().optional(),
  code: z.string(),
  cases: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
      }),
    )
    .default([]),
});

export const runtimeAnalyzerSchema = z.object({
  language: z.string().trim().min(1),
  sourceCode: z.string().min(1, "Source code is required"),
});

export const runtimeAnalyzerParamSchema = z.object({
  problemId: z.string().trim().min(1, "Missing problemId in URL"),
});

/* ------------------------ Complexity validation ----------------------- */

export const validateComplexitySchema = z.object({
  problemId: z.string(),
  casesData: z.object({
    expectedComplexity: complexityEnum,
    cases: z
      .array(
        z.object({
          input: z.string(),
          output: z.string(),
          size: z.enum(["N", "2N", "4N"]),
        }),
      )
      .length(3),
  }),
});

/* ------------------------------ Accounts ------------------------------ */

export const bulkSignUpSchema = z.object({
  emails: z
    .array(z.string().email("Invalid email address"))
    .min(1, "At least one email is required")
    .max(500, "Cannot sign up more than 500 users at once"),
  roleId: globalRoleIdSchema.optional(),
});

export const adminSingleSignUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  roleId: globalRoleIdSchema.optional(),
});

export const adminAssignRoleSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  roleId: globalRoleIdSchema.optional(),
});

export const adminResetPasswordSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  revokeSessions: z.boolean().optional().default(true),
});

/* ------------------------------ Colleges ------------------------------ */

export const createCollegeSchema = z.object({
  name: z.string().trim().min(1, "College name is required"),
});

/**
 * Multipart bodies are parsed by multer before validation. `collegeId` stays
 * optional here so the service can keep the legacy "College selection is
 * required" message instead of a generic validation error.
 */
export const bulkSignupMetaSchema = z.object({
  groupId: z.string().optional(),
  collegeId: z.string().optional(),
});

export const bulkSignupCsvSchema = z.object({
  csvContent: z.string().min(1, "csvContent is required"),
  filename: z.string().optional(),
});

export type DriverCodeInput = z.infer<typeof driverCodeSchema>;
export type PerformanceConstraintsInput = z.infer<
  typeof performanceConstraintsSchema
>;
export type CreatePerformanceTestCaseInput = z.infer<
  typeof createPerformanceTestCaseSchema
>;
export type BulkProblemInput = z.infer<typeof bulkProblemSchema>;
export type ProblemEditorInput = z.infer<typeof problemEditorSchema>;
export type ToggleHiddenInput = z.infer<typeof toggleHiddenSchema>;
export type TogglePublishInput = z.infer<typeof togglePublishSchema>;
export type AdminProblemsQuery = z.infer<typeof adminProblemsQuerySchema>;
export type RunReferenceSolutionInput = z.infer<
  typeof runReferenceSolutionSchema
>;
export type RuntimeAnalyzerInput = z.infer<typeof runtimeAnalyzerSchema>;
export type ValidateComplexityInput = z.infer<typeof validateComplexitySchema>;
export type BulkSignUpInput = z.infer<typeof bulkSignUpSchema>;
export type AdminSingleSignUpInput = z.infer<typeof adminSingleSignUpSchema>;
export type AdminAssignRoleInput = z.infer<typeof adminAssignRoleSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type CreateCollegeInput = z.infer<typeof createCollegeSchema>;
export type BulkSignupMetaInput = z.infer<typeof bulkSignupMetaSchema>;
export type BulkSignupCsvInput = z.infer<typeof bulkSignupCsvSchema>;
