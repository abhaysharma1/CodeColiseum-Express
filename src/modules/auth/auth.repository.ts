import prisma from "@/infrastructure/database/prisma";

export interface CreatedUserRecord {
  id: string;
  name: string;
  email: string;
  globalRoleId: string | null;
}

export async function findUserIdByEmail(
  email: string,
): Promise<{ id: string } | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
}

export async function activateUserWithRole(
  email: string,
  roleId: string,
): Promise<CreatedUserRecord> {
  return prisma.user.update({
    where: { email },
    data: {
      isOnboarded: true,
      globalRoleId: roleId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      globalRoleId: true,
    },
  });
}
