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

export const createModuleSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  weekNumber: z.number().int().positive(),
  orderIndex: z.number().int().min(0).optional(),
  unlockAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  assessmentExamId: z.string().optional(),
}).refine(
  (data) => {
    if (data.unlockAt && data.dueAt) {
      return new Date(data.unlockAt) < new Date(data.dueAt);
    }
    return true;
  },
  { message: "unlockAt must be before dueAt", path: ["dueAt"] },
);

export const updateModuleSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  weekNumber: z.number().int().positive().optional(),
  orderIndex: z.number().int().min(0).optional(),
  unlockAt: z.string().datetime().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  assessmentExamId: z.string().optional().nullable(),
}).refine(
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

export const updateModuleProblemAccessSchema = z.object({
  isUnlocked: z.boolean().optional(),
  availableFrom: z.string().datetime().optional().nullable(),
  availableUntil: z.string().datetime().optional().nullable(),
}).refine(
  (data) => {
    if (data.availableFrom && data.availableUntil) {
      return new Date(data.availableFrom) < new Date(data.availableUntil);
    }
    return true;
  },
  { message: "availableFrom must be before availableUntil", path: ["availableUntil"] },
);

export const assignAssessmentSchema = z.object({
  examId: z.string(),
});

export const createAssessmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  durationMin: z.number().int().positive().optional(),
});
