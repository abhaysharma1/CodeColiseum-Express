import { z } from "zod";

const difficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]).optional();

const tagIdsSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return value.filter(Boolean);
    return value.split(",").map((id) => id.trim()).filter(Boolean);
  });

export const marketplaceQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  sort: z
    .enum(["newest", "updated", "most_duplicated", "highest_rated"])
    .default("newest"),
  difficulty: difficultyEnum,
  subject: z.string().optional(),
  programmingLanguage: z.string().optional(),
  tagIds: tagIdsSchema,
  minProblems: z.coerce.number().int().min(0).optional(),
  maxProblems: z.coerce.number().int().min(0).optional(),
});

export const publishLabSchema = z.object({
  confirm: z.boolean().refine((value) => value === true, {
    message: "You must confirm publishing",
  }),
});

export const rateLabSchema = z.object({
  score: z.number().int().min(1).max(5),
  review: z.string().max(1000).optional(),
});

export const labIdParamSchema = z.object({
  labId: z.string().trim().min(1),
});

export type MarketplaceQuery = z.infer<typeof marketplaceQuerySchema>;
export type RateLabInput = z.infer<typeof rateLabSchema>;
export type PublishLabInput = z.infer<typeof publishLabSchema>;
