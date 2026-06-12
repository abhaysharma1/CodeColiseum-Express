import { z } from "zod";

export const createLabSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
});

export const updateLabSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

export const assignLabSchema = z.object({
  groupIds: z.array(z.string()).min(1),
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

export const assignAssessmentSchema = z.object({
  examId: z.string(),
});

export const createAssessmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  durationMin: z.number().int().positive().optional(),
});
