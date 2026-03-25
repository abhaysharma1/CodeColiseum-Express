export const GLOBAL_ROLE_IDS = {
  PLATFORM_ADMIN: "role_platform_admin",
  ORG_TEACHER: "role_org_teacher",
  ORG_STUDENT: "role_org_student"
} as const;

export type GlobalRoleId =
  (typeof GLOBAL_ROLE_IDS)[keyof typeof GLOBAL_ROLE_IDS];

export const GROUP_ROLE_IDS = {
  OWNER: "role_group_owner",
  MEMBER: "role_group_member"
} as const;

export type GroupRoleId = (typeof GROUP_ROLE_IDS)[keyof typeof GROUP_ROLE_IDS];