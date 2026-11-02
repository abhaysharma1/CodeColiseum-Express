import { z } from "zod";

export const orgGroupsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const orgExamsQuerySchema = orgGroupsQuerySchema;

export const orgStudentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  scoreMin: z.coerce.number().min(0).max(100).default(0),
  scoreMax: z.coerce.number().min(0).max(100).default(100),
  groupId: z.string().trim().min(1).optional(),
});

export const orgProblemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const chartDataQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const topStudentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

export type OrgStudentsQuery = z.infer<typeof orgStudentsQuerySchema>;
export type PaginationQuery = z.infer<typeof orgGroupsQuerySchema>;
