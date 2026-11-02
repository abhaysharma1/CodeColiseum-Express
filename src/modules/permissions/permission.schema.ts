import { z } from "zod";

export const checkPermissionQuerySchema = z.object({
  permission: z.string().trim().min(1, "permission is required"),
  groupId: z.string().trim().min(1).optional(),
});

export type CheckPermissionQuery = z.infer<typeof checkPermissionQuerySchema>;
