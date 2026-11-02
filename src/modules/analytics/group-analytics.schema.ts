import { z } from "zod";

const groupId = z.string().trim().min(1, "groupId is required");

export const groupStatsQuerySchema = z.object({ groupId });

export const groupProblemsQuerySchema = z.object({
  groupId,
  take: z.coerce.number().int().min(1).max(100).default(10),
  skip: z.coerce.number().int().min(0).default(0),
  searchValue: z.string().trim().optional(),
});

export const studentProblemStatsQuerySchema = z.object({
  groupId,
  studentId: z.string().trim().min(1, "studentId is required"),
});

export const analyticsStudentsQuerySchema = z.object({
  groupId,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  scoreMin: z.coerce.number().min(0).max(100).default(0),
  scoreMax: z.coerce.number().min(0).max(100).default(100),
  completionMin: z.coerce.number().min(0).max(100).default(0),
  completionMax: z.coerce.number().min(0).max(100).default(100),
  completionStatus: z
    .enum(["all", "completed", "incomplete"])
    .default("all"),
  weakTopic: z.string().trim().optional(),
  sortBy: z
    .enum([
      "avgScore",
      "attempts",
      "lastActive",
      "completionPercentage",
      "name",
    ])
    .default("avgScore"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const studentDetailsParamsSchema = z.object({
  studentId: z.string().trim().min(1, "studentId is required"),
});

export const analyticsOverviewQuerySchema = z.object({ groupId });

export const analyticsChartsQuerySchema = z.object({
  groupId,
  type: z
    .enum(["all", "distribution", "trend", "completion", "time"])
    .default("all"),
});

export const analyticsProblemsQuerySchema = z.object({
  groupId,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional(),
  difficultyTier: z.string().trim().default("all"),
  sortBy: z
    .enum([
      "attemptedCount",
      "successRate",
      "failureRate",
      "avgTime",
      "acceptedCount",
      "totalAttempts",
      "avgRuntime",
    ])
    .default("attemptedCount"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const problemDetailsParamsSchema = z.object({
  problemId: z.string().trim().min(1, "problemId is required"),
});

export const analyticsProblemStudentsQuerySchema = z.object({
  groupId,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional(),
  solvedStatus: z
    .enum(["all", "solved", "unsolved", "weak"])
    .default("all"),
});

export const analyticsExamsQuerySchema = z.object({
  groupId,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional(),
  status: z
    .enum([
      "all",
      "scheduled",
      "active",
      "completed",
      "ai_processing",
      "finished",
    ])
    .default("all"),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sortBy: z
    .enum(["endDate", "startDate", "title", "durationMin"])
    .default("endDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const examDetailsParamsSchema = z.object({
  examId: z.string().trim().min(1, "examId is required"),
});

export const analyticsExportQuerySchema = z.object({ groupId });

export type AnalyticsStudentsQuery = z.infer<
  typeof analyticsStudentsQuerySchema
>;
export type AnalyticsProblemsQuery = z.infer<
  typeof analyticsProblemsQuerySchema
>;
export type AnalyticsProblemStudentsQuery = z.infer<
  typeof analyticsProblemStudentsQuerySchema
>;
export type AnalyticsExamsQuery = z.infer<typeof analyticsExamsQuerySchema>;
export type ChartsQuery = z.infer<typeof analyticsChartsQuerySchema>;
export type GroupProblemsQuery = z.infer<typeof groupProblemsQuerySchema>;
