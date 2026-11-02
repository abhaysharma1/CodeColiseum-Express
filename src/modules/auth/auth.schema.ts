import { z } from "zod";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";

export const publicSignupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  roleId: z
    .enum([GLOBAL_ROLE_IDS.ORG_STUDENT, GLOBAL_ROLE_IDS.ORG_TEACHER])
    .optional()
    .default(GLOBAL_ROLE_IDS.ORG_STUDENT),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
});

export type PublicSignupInput = z.infer<typeof publicSignupSchema>;
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;
