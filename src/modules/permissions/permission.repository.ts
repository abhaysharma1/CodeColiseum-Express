import prisma from "@/infrastructure/database/prisma";
import type { Prisma } from "../../../generated/prisma/client";

const permissionSelect = {
  permission: {
    select: { key: true },
  },
} satisfies Prisma.RolePermissionInclude;

const roleWithPermissionsSelect = {
  scope: true,
  permissions: {
    include: permissionSelect,
  },
} satisfies Prisma.RoleSelect;

export type RoleWithPermissions = Prisma.RoleGetPayload<{
  select: typeof roleWithPermissionsSelect;
}>;

export interface GroupRoleRecord {
  groupId: string;
  role: RoleWithPermissions | null;
}

export async function findGlobalRolePermissions(
  userId: string,
): Promise<RoleWithPermissions | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      globalRole: {
        select: roleWithPermissionsSelect,
      },
    },
  });

  return user?.globalRole ?? null;
}

export async function findGroupMemberRole(
  userId: string,
  groupId: string,
): Promise<RoleWithPermissions | null> {
  const member = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
    select: {
      role: {
        select: roleWithPermissionsSelect,
      },
    },
  });

  return member?.role ?? null;
}

export async function findUserWithRolePermissions(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      globalRoleId: true,
      globalRole: {
        select: {
          permissions: {
            include: permissionSelect,
          },
        },
      },
    },
  });
}

export async function findMembershipRoles(
  userId: string,
): Promise<GroupRoleRecord[]> {
  return prisma.groupMember.findMany({
    where: { userId },
    select: {
      groupId: true,
      role: {
        select: roleWithPermissionsSelect,
      },
    },
  });
}
