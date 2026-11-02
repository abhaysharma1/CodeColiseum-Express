import prisma from "@/infrastructure/database/prisma";

export interface UserRoleRecord {
  id: string;
  globalRoleId: string | null;
}

/**
 * Role lookups are performed server-side on every request. Client-provided
 * roles are never trusted.
 */
export async function findUserGlobalRole(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { globalRoleId: true },
  });

  return user?.globalRoleId ?? null;
}

export async function findUserRoleRecord(
  userId: string,
): Promise<UserRoleRecord | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, globalRoleId: true },
  });
}
