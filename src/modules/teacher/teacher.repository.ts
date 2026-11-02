import prisma from "@/infrastructure/database/prisma";
import type {
  NotificationPriority,
  NotificationType,
} from "../../../generated/prisma/enums";

/**
 * Shared Prisma access for the teacher domain.
 *
 * Domain-specific queries live next to their owners:
 *  - `exam-teacher.repository.ts`  — exam builder / results / bulk actions
 *  - `group-teacher.repository.ts` — groups, members and co-teachers
 *
 * This file holds the primitives both of them need (identity, access lookups,
 * notifications) so neither repository has to import the other.
 */

export async function findUserGlobalRole(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { globalRoleId: true },
  });

  return user?.globalRoleId ?? null;
}

export async function findExamGroupId(examId: string): Promise<string | undefined> {
  const examGroup = await prisma.examGroup.findFirst({
    where: { examId },
    select: { groupId: true },
  });

  return examGroup?.groupId;
}

export async function findGroupById(groupId: string) {
  return prisma.group.findUnique({ where: { id: groupId } });
}

export async function findGroupMembership(groupId: string, userId: string) {
  return prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { roleId: true },
  });
}

export async function findAllGroupsForAccess() {
  return prisma.group.findMany({
    select: { id: true, creatorId: true },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, globalRoleId: true },
  });
}

export async function findUsersByEmails(emails: string[]) {
  if (emails.length === 0) {
    return [];
  }

  return prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, name: true, globalRoleId: true },
  });
}

export interface NotificationRecordInput {
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  senderId: string;
  groupId?: string | null;
  examId?: string | null;
  recipientIds: string[];
}

export async function createNotificationRecord(
  input: NotificationRecordInput,
): Promise<void> {
  await prisma.notification.create({
    data: {
      title: input.title,
      message: input.message,
      type: input.type,
      priority: input.priority,
      senderId: input.senderId,
      groupId: input.groupId ?? null,
      examId: input.examId ?? null,
      recipients: {
        createMany: {
          data: input.recipientIds.map((userId) => ({ userId })),
          skipDuplicates: true,
        },
      },
    },
  });
}
