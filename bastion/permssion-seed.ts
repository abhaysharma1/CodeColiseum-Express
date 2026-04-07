import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export const PERMISSIONS = {
	GROUP_VIEW: "group:view",
	GROUP_EDIT: "group:edit",
	GROUP_DELETE: "group:delete",
	EXAM_CREATE: "exam:create",
	EXAM_EDIT: "exam:edit",
	EXAM_PUBLISH: "exam:publish",
	SUBMISSION_VIEW: "submission:view",
	SUBMISSION_GRADE: "submission:grade",
	ANALYTICS_VIEW: "analytics:view"
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_ALIASES: Record<PermissionKey, readonly string[]> = {
	[PERMISSIONS.GROUP_VIEW]: ["GROUP_VIEW"],
	[PERMISSIONS.GROUP_EDIT]: ["GROUP_EDIT"],
	[PERMISSIONS.GROUP_DELETE]: ["GROUP_DELETE"],
	[PERMISSIONS.EXAM_CREATE]: ["CREATE_EXAM"],
	[PERMISSIONS.EXAM_EDIT]: ["EDIT_EXAM"],
	[PERMISSIONS.EXAM_PUBLISH]: ["PUBLISH_EXAM"],
	[PERMISSIONS.SUBMISSION_VIEW]: ["VIEW_SUBMISSION"],
	[PERMISSIONS.SUBMISSION_GRADE]: ["GRADE_SUBMISSION"],
	[PERMISSIONS.ANALYTICS_VIEW]: ["VIEW_ANALYTICS"]
};


const rawConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set before running RBAC seed");
}

const connectionUrl = new URL(rawConnectionString);
const useLibpqCompat = process.env.PG_USE_LIBPQ_COMPAT === "true";

if (useLibpqCompat) {
  connectionUrl.searchParams.set("uselibpqcompat", "true");
  if (!connectionUrl.searchParams.has("sslmode")) {
    connectionUrl.searchParams.set("sslmode", "require");
  }
} else if (!connectionUrl.searchParams.has("sslmode")) {
  connectionUrl.searchParams.set("sslmode", "verify-full");
}

const connectionString = connectionUrl.toString();
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

async function seedPermissions() {
  const values = Object.values(PERMISSIONS);

  for (const key of values) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: {
        key,
        description: key
      }
    });
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
      description: "Co-teacher with teaching and analytics permissions",
      scope: "GROUP"
    },
    create: {
      id: ROLE_IDS.GROUP_COTEACHER,
      name: "Group Co-Teacher",
      description: "Co-teacher with teaching and analytics permissions",
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

async function main() {
  const permissionIdByKey = await seedPermissions();
  await seedRoles(permissionIdByKey);
  console.log("Bastion RBAC seed completed");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Bastion RBAC seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
