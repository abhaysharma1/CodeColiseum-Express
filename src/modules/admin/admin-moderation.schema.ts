import { z } from "zod";

export const moderationListQuerySchema = z.object({
  searchValue: z.string().trim().optional(),
  take: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
});

export const moderationProblemParamSchema = z.object({
  id: z.string().trim().min(1, "Problem id is required"),
});

export const rejectProblemSchema = z.object({
  reason: z.string().trim().min(1, "Rejection reason is required"),
});

export type ModerationListQuery = z.infer<typeof moderationListQuerySchema>;
export type RejectProblemInput = z.infer<typeof rejectProblemSchema>;
