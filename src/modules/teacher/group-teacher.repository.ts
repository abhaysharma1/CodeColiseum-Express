import type { Prisma } from "../../../generated/prisma/client";
import type { groupType } from "../../../generated/prisma/enums";
import prisma from "@/infrastructure/database/prisma";
import { runInTransaction } from "@/infrastructure/database/transactions";

/**
 * Prisma access for teacher group management. Business rules live in
 * `group-teacher.service.ts`.
 */

export async function findGroupByNameAndCreator(
  name: string,
  creatorId: string,
) {
  return prisma.group.findFirst({
    where: { name, creatorId },
  });
}

export interface CreateGroupRecordInput {
  name: string;
  description: string;
  creatorId: string;
  joinByLink: boolean;
  type: groupType;
  aiEnabled: boolean;
  aiMaxMessages?: number;
  aiMaxTokens?: number;
}

export async function createGroupRecord(input: CreateGroupRecordInput) {
  return prisma.group.create({
    data: {
      name: input.name,
      description: input.description,
      creatorId: input.creatorId,
      joinByLink: input.joinByLink,
      type: input.type,
      aiEnabled: input.aiEnabled,
      aiMaxMessages: input.aiMaxMessages ?? null,
      aiMaxTokens: input.aiMaxTokens ?? null,
    },
  });
}

export async function createGroupMember(
  groupId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await prisma.groupMember.create({
    data: { groupId, userId, roleId },
  });
}

export async function findGroupMembersWithUsers(
  groupId: string,
  userIds: string[],
) {
  if (userIds.length === 0) {
    return [];
  }

  return prisma.groupMember.findMany({
    where: {
      groupId,
      userId: { in: userIds },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });
}

/**
 * Inserts the members and bumps `noOfMembers` by the number of intended
 * inserts (legacy behaviour) in one transaction.
 */
export async function addGroupMembersAndIncrement(
  groupId: string,
  userIds: string[],
  roleId: string,
  incrementBy: number,
): Promise<void> {
  if (userIds.length === 0) return;

  await runInTransaction(async (tx) => {
    await tx.groupMember.createMany({
      data: userIds.map((userId) => ({ groupId, userId, roleId })),
    });

    await tx.group.update({
      where: { id: groupId },
      data: { noOfMembers: { increment: incrementBy } },
    });
  });
}

export async function findGroupsForTeacher(where: Prisma.GroupWhereInput) {
  return prisma.group.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

export async function findUsersInGroup(groupId: string) {
  return prisma.user.findMany({
    where: {
      memberGroups: {
        some: { groupId },
      },
    },
  });
}

export async function countUsersInGroup(where: Prisma.UserWhereInput) {
  return prisma.user.count({ where });
}

export async function findUsersInGroupPage(params: {
  where: Prisma.UserWhereInput;
  skip: number;
  take: number;
}) {
  return prisma.user.findMany({
    where: params.where,
    skip: params.skip,
    take: params.take,
    orderBy: { createdAt: "desc" },
  });
}

export async function findExamsForGroup(groupId: string) {
  return prisma.exam.findMany({
    where: {
      examGroups: {
        some: { groupId },
      },
    },
    orderBy: { endDate: "desc" },
    select: {
      id: true,
      title: true,
      isPublished: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });
}

export interface UpdateGroupRecordInput {
  groupId: string;
  name: string;
  description: string | null;
  type: groupType;
  aiEnabled: boolean;
  aiMaxMessages?: number;
  aiMaxTokens?: number;
}

export async function updateGroupRecord(input: UpdateGroupRecordInput) {
  return prisma.group.update({
    where: { id: input.groupId },
    data: {
      name: input.name,
      description: input.description,
      type: input.type,
      aiEnabled: input.aiEnabled,
      aiMaxMessages: input.aiEnabled ? (input.aiMaxMessages ?? null) : null,
      aiMaxTokens: input.aiEnabled ? (input.aiMaxTokens ?? null) : null,
    },
  });
}

export async function deleteGroupAndDetachNotifications(
  groupId: string,
): Promise<void> {
  await runInTransaction(async (tx) => {
    await tx.notification.updateMany({
      where: { groupId },
      data: { groupId: null },
    });

    await tx.group.delete({ where: { id: groupId } });
  });
}

export async function removeGroupMemberAndDecrement(
  groupId: string,
  userId: string,
): Promise<void> {
  await runInTransaction(async (tx) => {
    await tx.groupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });

    await tx.group.update({
      where: { id: groupId },
      data: { noOfMembers: { decrement: 1 } },
    });
  });
}

export async function upsertCoTeacher(
  groupId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await prisma.groupMember.upsert({
    where: {
      groupId_userId: { groupId, userId },
    },
    update: { roleId },
    create: { groupId, userId, roleId },
  });
}

export async function createGroupMembersAndIncrement(
  groupId: string,
  userIds: string[],
  roleId: string,
): Promise<number> {
  if (userIds.length === 0) return 0;

  const result = await prisma.groupMember.createMany({
    data: userIds.map((userId) => ({ groupId, userId, roleId })),
  });

  await prisma.group.update({
    where: { id: groupId },
    data: { noOfMembers: { increment: result.count } },
  });

  return result.count;
}
