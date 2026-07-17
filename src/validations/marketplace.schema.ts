import { z } from "zod";

const difficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]).optional();

export const marketplaceQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  sort: z.enum(["newest", "updated", "most_duplicated", "highest_rated"]).default("newest"),
  difficulty: difficultyEnum,
  subject: z.string().optional(),
  programmingLanguage: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
  minProblems: z.coerce.number().int().min(0).optional(),
  maxProblems: z.coerce.number().int().min(0).optional(),
});

export const publishLabSchema = z.object({
  confirm: z.boolean().refine((v) => v === true, { message: "You must confirm publishing" }),
});

export const rateLabSchema = z.object({
  score: z.number().int().min(1).max(5),
  review: z.string().max(1000).optional(),
});
