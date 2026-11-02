import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import { getPermissionLookupKeys, hasGroupPermission } from "@/modules/permissions/permission.service";
import { ForbiddenError } from "@/shared/errors";
import * as teacherRepository from "./teacher.repository";

/**
 * Shared teacher business rules.
 *
 * Exam/group access is granted to the creator, platform admins, and members of
 * the associated group whose role carries the requested permission. This is the
 * "fallback" policy the legacy controllers implemented inline.
 */

export async function canAccessExamWithFallback(
  userId: string,
  examId: string,
  creatorId: string,
  permission: string,
): Promise<boolean> {
  if (creatorId === userId) return true;

  const globalRoleId = await teacherRepository.findUserGlobalRole(userId);
  if (globalRoleId === GLOBAL_ROLE_IDS.PLATFORM_ADMIN) return true;

  const groupId = await teacherRepository.findExamGroupId(examId);
  if (!groupId) return false;

  const permissionKeys = getPermissionLookupKeys(permission);
  return hasGroupPermission(userId, groupId, permissionKeys);
}

export async function canAccessGroupWithFallback(
  userId: string,
  groupId: string,
  creatorId: string,
  permission: string,
): Promise<boolean> {
  if (creatorId === userId) return true;

  const globalRoleId = await teacherRepository.findUserGlobalRole(userId);
  if (globalRoleId === GLOBAL_ROLE_IDS.PLATFORM_ADMIN) return true;

  const permissionKeys = getPermissionLookupKeys(permission);
  return hasGroupPermission(userId, groupId, permissionKeys);
}

export async function assertCanAccessExam(
  userId: string,
  examId: string,
  creatorId: string,
  permission: string,
  message = "Not Authorized",
): Promise<void> {
  const allowed = await canAccessExamWithFallback(
    userId,
    examId,
    creatorId,
    permission,
  );

  if (!allowed) {
    throw new ForbiddenError(message);
  }
}

export async function assertCanAccessGroup(
  userId: string,
  groupId: string,
  creatorId: string,
  permission: string,
  message = "Not Authorized",
): Promise<void> {
  const allowed = await canAccessGroupWithFallback(
    userId,
    groupId,
    creatorId,
    permission,
  );

  if (!allowed) {
    throw new ForbiddenError(message);
  }
}

export * from "./teacher.rules";
