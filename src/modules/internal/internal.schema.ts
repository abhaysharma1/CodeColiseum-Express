import { z } from "zod";

export const recomputeAnalyticsBodySchema = z.object({
  examId: z.string().trim().min(1).optional(),
  groupId: z.string().trim().min(1).optional(),
});

export type RecomputeAnalyticsInput = z.infer<
  typeof recomputeAnalyticsBodySchema
>;
