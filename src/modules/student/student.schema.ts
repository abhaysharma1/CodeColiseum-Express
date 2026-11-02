import { z } from "zod";
import { groupType } from "../../../generated/prisma/enums";

const groupTypes = Object.values(groupType) as [
  (typeof groupType)[keyof typeof groupType],
  ...(typeof groupType)[keyof typeof groupType][],
];

export const studentGroupsQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
  searchValue: z.string().trim().optional(),
  groupType: z.enum(groupTypes).optional(),
});

export const groupIdQuerySchema = z.object({
  groupId: z.string().trim().min(1, "groupId is required"),
});

export const groupExamsQuerySchema = z.object({
  groupId: z.string().trim().min(1, "groupId is required"),
  take: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
  searchValue: z.string().trim().default(""),
});

export const examIdQuerySchema = z.object({
  examId: z.string().trim().min(1, "examId is required"),
});

export type StudentGroupsQuery = z.infer<typeof studentGroupsQuerySchema>;
export type GroupExamsQuery = z.infer<typeof groupExamsQuerySchema>;
