import { z } from "zod";

const difficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]).optional();

export const createLabSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  aiEnabled: z.boolean().optional().default(false),
  aiMaxMessages: z.number().int().min(1).max(50).optional(),
  aiMaxTokens: z.number().int().min(50).max(10000).optional(),
  sebEnabled: z.boolean().optional(),
  difficulty: difficultyEnum,
  subject: z.string().max(100).optional(),
  programmingLanguage: z.string().max(50).optional(),
  estimatedDuration: z.number().int().min(1).optional(),
});

export const updateLabSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  aiEnabled: z.boolean().optional(),
  aiMaxMessages: z.number().int().min(1).max(50).optional(),
  aiMaxTokens: z.number().int().min(50).max(10000).optional(),
  sebEnabled: z.boolean().optional(),
  difficulty: difficultyEnum,
  subject: z.string().max(100).optional(),
  programmingLanguage: z.string().max(50).optional(),
  estimatedDuration: z.number().int().min(1).optional(),
});

export const assignLabSchema = z.object({
  groupId: z.string(),
});

export const createModuleSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    weekNumber: z.number().int().positive(),
    orderIndex: z.number().int().min(0).optional(),
    unlockAt: z.string().datetime().optional(),
    dueAt: z.string().datetime().optional(),
    assessmentExamId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.unlockAt && data.dueAt) {
        return new Date(data.unlockAt) < new Date(data.dueAt);
      }
      return true;
    },
    { message: "unlockAt must be before dueAt", path: ["dueAt"] },
  );

export const updateModuleSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    weekNumber: z.number().int().positive().optional(),
    orderIndex: z.number().int().min(0).optional(),
    unlockAt: z.string().datetime().optional().nullable(),
    dueAt: z.string().datetime().optional().nullable(),
    assessmentExamId: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.unlockAt && data.dueAt) {
        return new Date(data.unlockAt) < new Date(data.dueAt);
      }
      return true;
    },
    { message: "unlockAt must be before dueAt", path: ["dueAt"] },
  );

export const addModuleProblemsSchema = z.object({
  problemIds: z.array(z.string()).min(1),
});

export const updateModuleProblemAccessSchema = z
  .object({
    isUnlocked: z.boolean().optional(),
    availableFrom: z.string().datetime().optional().nullable(),
    availableUntil: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.availableFrom && data.availableUntil) {
        return new Date(data.availableFrom) < new Date(data.availableUntil);
      }
      return true;
    },
    {
      message: "availableFrom must be before availableUntil",
      path: ["availableUntil"],
    },
  );

export const assignAssessmentSchema = z.object({
  examId: z.string(),
});

export const createAssessmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  durationMin: z.number().int().positive().optional(),
});

export const addLabTeacherSchema = z
  .object({
    email: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.email || data.userId), {
    message: "email or userId is required",
  });

// ── Query schemas ──

function numberWithDefault(defaultValue: number, min?: number, max?: number) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return defaultValue;
    }

    // Legacy controllers used `Number(value) || default`, so an explicit zero
    // fell back to the default for page sizes.
    if (parsed === 0 && defaultValue > 0) {
      return defaultValue;
    }

    if (min !== undefined && parsed < min) {
      return min;
    }

    if (max !== undefined && parsed > max) {
      return max;
    }

    return parsed;
  }, z.number().int());
}

export const listLabsQuerySchema = z.object({
  take: numberWithDefault(10, 1),
  skip: numberWithDefault(0, 0),
  scope: z.string().optional(),
  searchvalue: z.string().optional(),
});

export const moduleAnalyticsQuerySchema = z.object({
  groupId: z.string().optional(),
});

export const studentProgressQuerySchema = z.object({
  groupId: z.string().optional(),
  take: numberWithDefault(20, 1, 100),
  skip: numberWithDefault(0, 0),
  search: z.string().optional().default(""),
  sortBy: z
    .enum(["name", "solvedProblems", "completionPercentage"])
    .catch("name"),
  sortOrder: z.enum(["asc", "desc"]).catch("asc"),
});

export const teacherSearchQuerySchema = z.object({
  q: z.string().optional(),
});

export const moduleExportQuerySchema = z.object({
  groupId: z.string().optional(),
});

// ── Params schemas ──

export const labIdParamSchema = z.object({
  labId: z.string().min(1),
});

export const moduleIdParamSchema = z.object({
  moduleId: z.string().min(1),
});

export const moduleProblemIdParamSchema = z.object({
  moduleProblemId: z.string().min(1),
});

export const labTeacherParamSchema = z.object({
  labId: z.string().min(1),
  teacherUserId: z.string().min(1),
});

export const moduleStudentParamSchema = z.object({
  moduleId: z.string().min(1),
  studentId: z.string().min(1),
});

export const moduleStudentProblemParamSchema = z.object({
  moduleId: z.string().min(1),
  studentId: z.string().min(1),
  moduleProblemId: z.string().min(1),
});

export type CreateLabInput = z.infer<typeof createLabSchema>;
export type UpdateLabInput = z.infer<typeof updateLabSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type AssignLabInput = z.infer<typeof assignLabSchema>;
export type AddModuleProblemsInput = z.infer<typeof addModuleProblemsSchema>;
export type UpdateModuleProblemAccessInput = z.infer<
  typeof updateModuleProblemAccessSchema
>;
export type AssignAssessmentInput = z.infer<typeof assignAssessmentSchema>;
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type AddLabTeacherInput = z.infer<typeof addLabTeacherSchema>;
export type ListLabsQuery = z.infer<typeof listLabsQuerySchema>;
export type ModuleAnalyticsQuery = z.infer<typeof moduleAnalyticsQuerySchema>;
export type StudentProgressQuery = z.infer<typeof studentProgressQuerySchema>;
export type TeacherSearchQuery = z.infer<typeof teacherSearchQuerySchema>;
export type ModuleExportQuery = z.infer<typeof moduleExportQuerySchema>;
