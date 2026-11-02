/**
 * Shape of the authenticated principal attached to `req.user`.
 * It mirrors the Better Auth user record plus the fields added to the schema.
 */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  isOnboarded?: boolean | null;
  globalRoleId?: string | null;
  [key: string]: unknown;
}
