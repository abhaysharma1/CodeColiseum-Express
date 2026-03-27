import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { PERMISSIONS } from "../src/permissions/permission.constants";

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL must be set before running RBAC seed");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const ROLE_IDS = {
  PLATFORM_ADMIN: "role_platform_admin",
  ORG_TEACHER: "role_org_teacher",
  ORG_STUDENT: "role_org_student",
  GROUP_OWNER: "role_group_owner",
  GROUP_MEMBER: "role_group_member",
  GROUP_COTEACHER: "role_group_coteacher"
} as const;

function isTransientPrismaError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === "P1017";
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientPrismaError(error) || attempt === attempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  throw lastError;
}

async function seedPermissions() {
  const values = Object.values(PERMISSIONS);

  for (const key of values) {
    await withRetry(() =>
      prisma.permission.upsert({
        where: { key },
        update: {},
        create: {
          key,
          description: key
        }
      })
    );
  }

  const rows = await prisma.permission.findMany({
    where: { key: { in: values } },
    select: { id: true, key: true }
  });

  return new Map(rows.map((row) => [row.key, row.id]));
}

async function seedRoles(permissionIdByKey: Map<string, string>) {
  await prisma.role.upsert({
    where: { id: ROLE_IDS.PLATFORM_ADMIN },
    update: {
      name: "Platform Admin",
      description: "Global admin role",
      scope: "PLATFORM"
    },
    create: {
      id: ROLE_IDS.PLATFORM_ADMIN,
      name: "Platform Admin",
      description: "Global admin role",
      scope: "PLATFORM"
    }
  });

  await prisma.role.upsert({
    where: { id: ROLE_IDS.ORG_TEACHER },
    update: {
      name: "Organization Teacher",
      description: "Default teacher role",
      scope: "ORGANIZATION"
    },
    create: {
      id: ROLE_IDS.ORG_TEACHER,
      name: "Organization Teacher",
      description: "Default teacher role",
      scope: "ORGANIZATION"
    }
  });

  await prisma.role.upsert({
    where: { id: ROLE_IDS.ORG_STUDENT },
    update: {
      name: "Organization Student",
      description: "Default student role",
      scope: "ORGANIZATION"
    },
    create: {
      id: ROLE_IDS.ORG_STUDENT,
      name: "Organization Student",
      description: "Default student role",
      scope: "ORGANIZATION"
    }
  });

  await prisma.role.upsert({
    where: { id: ROLE_IDS.GROUP_OWNER },
    update: {
      name: "Group Owner",
      description: "Owns and manages a group",
      scope: "GROUP"
    },
    create: {
      id: ROLE_IDS.GROUP_OWNER,
      name: "Group Owner",
      description: "Owns and manages a group",
      scope: "GROUP"
    }
  });

  await prisma.role.upsert({
    where: { id: ROLE_IDS.GROUP_MEMBER },
    update: {
      name: "Group Member",
      description: "Default group member role",
      scope: "GROUP"
    },
    create: {
      id: ROLE_IDS.GROUP_MEMBER,
      name: "Group Member",
      description: "Default group member role",
      scope: "GROUP"
    }
  });

  await prisma.role.upsert({
    where: { id: ROLE_IDS.GROUP_COTEACHER },
    update: {
      name: "Group Co-Teacher",
      description:
        "Co-teacher for a group with teaching and analytics permissions, but limited management capabilities",
      scope: "GROUP"
    },
    create: {
      id: ROLE_IDS.GROUP_COTEACHER,
      name: "Group Co-Teacher",
      description:
        "Co-teacher for a group with teaching and analytics permissions, but limited management capabilities",
      scope: "GROUP"
    }
  });

  const allPermissionIds = Object.values(PERMISSIONS)
    .map((key) => permissionIdByKey.get(key))
    .filter((value): value is string => Boolean(value));

  const teacherPermissionIds = [
    PERMISSIONS.GROUP_VIEW,
    PERMISSIONS.GROUP_EDIT,
    PERMISSIONS.GROUP_DELETE,
    PERMISSIONS.EXAM_CREATE,
    PERMISSIONS.EXAM_EDIT,
    PERMISSIONS.EXAM_PUBLISH,
    PERMISSIONS.SUBMISSION_VIEW,
    PERMISSIONS.SUBMISSION_GRADE,
    PERMISSIONS.ANALYTICS_VIEW
  ]
    .map((key) => permissionIdByKey.get(key))
    .filter((value): value is string => Boolean(value));

  const studentPermissionIds = [PERMISSIONS.GROUP_VIEW, PERMISSIONS.SUBMISSION_VIEW]
    .map((key) => permissionIdByKey.get(key))
    .filter((value): value is string => Boolean(value));

  const rolePermissions = [
    ...allPermissionIds.map((permissionId) => ({
      roleId: ROLE_IDS.PLATFORM_ADMIN,
      permissionId
    })),
    ...teacherPermissionIds.map((permissionId) => ({
      roleId: ROLE_IDS.ORG_TEACHER,
      permissionId
    })),
    ...teacherPermissionIds.map((permissionId) => ({
      roleId: ROLE_IDS.GROUP_OWNER,
      permissionId
    })),
    ...teacherPermissionIds.map((permissionId) => ({
      roleId: ROLE_IDS.GROUP_COTEACHER,
      permissionId
    })),
    ...studentPermissionIds.map((permissionId) => ({
      roleId: ROLE_IDS.ORG_STUDENT,
      permissionId
    })),
    ...studentPermissionIds.map((permissionId) => ({
      roleId: ROLE_IDS.GROUP_MEMBER,
      permissionId
    }))
  ];

  if (rolePermissions.length > 0) {
    await prisma.rolePermission.createMany({
      data: rolePermissions,
      skipDuplicates: true
    });
  }
}

async function backfillGroupMemberRoles() {
  const groupMembers = await prisma.groupMember.findMany({
    include: {
      group: {
        select: {
          creatorId: true
        }
      }
    }
  });

  const updates = groupMembers
    .map((member) => {
      const desiredRoleId =
        member.userId === member.group.creatorId ? ROLE_IDS.GROUP_OWNER : ROLE_IDS.GROUP_MEMBER;

      if (member.roleId === desiredRoleId) {
        return null;
      }

      return prisma.groupMember.update({
        where: {
          groupId_userId: {
            groupId: member.groupId,
            userId: member.userId
          }
        },
        data: {
          roleId: desiredRoleId
        }
      });
    })
    .filter((query): query is ReturnType<typeof prisma.groupMember.update> => Boolean(query));

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

async function main() {
  const permissionIdByKey = await seedPermissions();
  await seedRoles(permissionIdByKey);
  await backfillGroupMemberRoles();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("RBAC seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });