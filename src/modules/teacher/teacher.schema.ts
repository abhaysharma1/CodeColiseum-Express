import { z } from "zod";

/**
 * Request schemas for the teacher domain (exam builder + group management).
 *
 * NOTE: handlers historically coerced/validated request values inline. The
 * schemas below keep the accepted payloads identical while moving the checks
 * into middleware. Where a legacy handler clamped pagination values, the schema
 * stays permissive and the service performs the clamping so behaviour is
 * preserved.
 */

const groupTypeSchema = z.enum(["CLASS", "BATCH", "SECTION", "CUSTOM"]);

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export const examIdQuerySchema = z.object({
  examId: z.string().trim().min(1, "examId is required"),
});

export const examIdBodySchema = z.object({
  examId: z.string().trim().min(1, "Exam ID is required"),
});

export const teacherGroupsQuerySchema = z.object({
  take: z.coerce.number().optional(),
  skip: z.coerce.number().optional(),
  searchValue: z.coerce.string().optional(),
  groupType: z.enum(["CLASS", "LAB"]).optional(),
});

// ---------------------------------------------------------------------------
// Exam listing / dashboard
// ---------------------------------------------------------------------------

export const fetchAllExamsQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  take: z.coerce.number().optional(),
  search: z.coerce.string().optional(),
  searchvalue: z.coerce.string().optional(),
  status: z.coerce.string().optional(),
  sort: z.coerce.string().optional(),
});

export const bulkExamActionBodySchema = z.object({
  testIds: z
    .array(z.string().min(1))
    .min(1, "testIds must be a non-empty array"),
});

// ---------------------------------------------------------------------------
// Exam builder
// ---------------------------------------------------------------------------

const selectedGroupSchema = z.object({
  id: z.string().min(1),
});

export const saveExamBodySchema = z.object({
  updatedExamDetails: z.object({
    id: z.string().min(1),
    title: z.string(),
    description: z.string().nullish(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    durationMin: z.coerce.number().int(),
    sebEnabled: z.boolean(),
  }),
  selectedGroups: z
    .union([selectedGroupSchema, z.array(selectedGroupSchema)])
    .nullish(),
  selectedProblemsId: z.array(z.string().min(1)).default([]),
});

export const updateExamSettingsBodySchema = z.object({
  examId: z.string().optional(),
  startDate: z.union([z.string(), z.date()]).optional(),
  endDate: z.union([z.string(), z.date()]).optional(),
  durationMin: z.union([z.number(), z.string()]).optional(),
  sebEnabled: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Group management
// ---------------------------------------------------------------------------

export const createGroupBodySchema = z.object({
  groupName: z.string(),
  description: z.string(),
  emails: z.array(z.string().email()),
  allowJoinByLink: z.boolean(),
  isAiEnabled: z.boolean(),
  type: groupTypeSchema,
  aiMaxMessages: z.number().min(1).max(50).optional(),
  aiMaxTokens: z.number().min(50).max(10000).optional(),
});

export const groupIdQuerySchema = z.object({
  groupId: z.string().trim().min(1, "groupId is required"),
});

export const groupMembersQuerySchema = z.object({
  groupId: z.string().trim().min(1, "groupId is required"),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.coerce.string().optional(),
});

export const studentGroupsQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.coerce.string().optional(),
  type: z.coerce.string().optional(),
  aiEnabled: z.coerce.string().optional(),
  sort: z.coerce.string().optional(),
});

export const addMemberBodySchema = z.object({
  groupId: z.string().trim().min(1, "groupId is required"),
  newEmails: z.string().min(1, "newEmails is required"),
});

export const addCoTeacherBodySchema = z.object({
  groupId: z.string().trim().min(1, "groupId is required"),
  email: z.string().trim().email(),
});

export const removeMemberBodySchema = z.object({
  groupId: z.string().trim().min(1, "groupId is required"),
  userId: z.string().trim().min(1, "userId is required"),
});

export const updateGroupBodySchema = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  type: groupTypeSchema,
  aiEnabled: z.boolean(),
  aiMaxMessages: z.number().min(1).max(50).optional(),
  aiMaxTokens: z.number().min(50).max(10000).optional(),
});

export const deleteGroupBodySchema = z.object({
  groupId: z.string().trim().min(1, "groupId is required"),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeacherGroupsQuery = z.infer<typeof teacherGroupsQuerySchema>;
export type FetchAllExamsQuery = z.infer<typeof fetchAllExamsQuerySchema>;
export type BulkExamActionBody = z.infer<typeof bulkExamActionBodySchema>;
export type SaveExamBody = z.infer<typeof saveExamBodySchema>;
export type SelectedGroup = z.infer<typeof selectedGroupSchema>;
export type UpdateExamSettingsBody = z.infer<
  typeof updateExamSettingsBodySchema
>;

export type CreateGroupInput = z.infer<typeof createGroupBodySchema>;
export type GroupMembersQuery = z.infer<typeof groupMembersQuerySchema>;
export type StudentGroupsQuery = z.infer<typeof studentGroupsQuerySchema>;
export type AddMemberInput = z.infer<typeof addMemberBodySchema>;
export type AddCoTeacherInput = z.infer<typeof addCoTeacherBodySchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberBodySchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupBodySchema>;
