import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import type { groupType } from "../../../generated/prisma/enums";
import { NotificationPriority, NotificationType } from "../../../generated/prisma/enums";
import { PERMISSIONS } from "@/permissions/permission.constants";
import { GLOBAL_ROLE_IDS, GROUP_ROLE_IDS } from "@/permissions/role.constants";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import {
  getStudentGroups as getStudentGroupsForTeacher,
  getStudentGroupsStats as getStudentGroupsStatsForTeacher,
} from "@/services/group.service";
import * as groupRepository from "./group-teacher.repository";
import * as teacherRepository from "./teacher.repository";
import {
  assertCanAccessGroup,
  canAccessGroupWithFallback,
} from "./teacher.service";
import type {
  AddCoTeacherInput,
  AddMemberInput,
  CreateGroupInput,
  GroupMembersQuery,
  RemoveMemberInput,
  StudentGroupsQuery,
  TeacherGroupsQuery,
  UpdateGroupInput,
} from "./teacher.schema";

/**
 * Teacher group business rules. No Express types and no direct Prisma access.
 */

interface GroupMemberSummary {
  email: string;
  name: string;
}

async function getGroupOrThrow(groupId: string) {
  const group = await teacherRepository.findGroupById(groupId);

  if (!group) {
    throw new NotFoundError("Group Not Found");
  }

  return group;
}

async function assertGroupOwner(
  userId: string,
  groupId: string,
  creatorId: string,
  message: string,
): Promise<void> {
  const membership = await teacherRepository.findGroupMembership(
    groupId,
    userId,
  );

  const isOwner =
    membership?.roleId === GROUP_ROLE_IDS.OWNER || creatorId === userId;

  if (!isOwner) {
    throw new ForbiddenError(message);
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function createGroup(userId: string, input: CreateGroupInput) {
  const existing = await groupRepository.findGroupByNameAndCreator(
    input.groupName,
    userId,
  );

  if (existing?.id) {
    throw new ConflictError("Group with same name already exists");
  }

  const newGroup = await groupRepository.createGroupRecord({
    name: input.groupName,
    description: input.description,
    creatorId: userId,
    joinByLink: input.allowJoinByLink,
    type: input.type,
    aiEnabled: input.isAiEnabled,
    aiMaxMessages: input.aiMaxMessages,
    aiMaxTokens: input.aiMaxTokens,
  });

  await groupRepository.createGroupMember(
    newGroup.id,
    userId,
    GROUP_ROLE_IDS.OWNER,
  );

  const validEmails = input.emails
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

  const notFoundMembers: string[] = [];
  const notStudents: GroupMemberSummary[] = [];
  const alreadyMembers: GroupMemberSummary[] = [];
  const successfullyAdded: GroupMemberSummary[] = [];

  const users = await teacherRepository.findUsersByEmails(validEmails);
  const userMap = new Map(users.map((user) => [user.email, user]));

  validEmails.forEach((email) => {
    if (!userMap.has(email)) {
      notFoundMembers.push(email);
    }
  });

  const studentsToAdd = users.filter((user) => {
    if (user.globalRoleId !== GLOBAL_ROLE_IDS.ORG_STUDENT) {
      notStudents.push({ email: user.email, name: user.name });
      return false;
    }

    return true;
  });

  const existingMembers = await groupRepository.findGroupMembersWithUsers(
    newGroup.id,
    studentsToAdd.map((user) => user.id),
  );

  const existingMemberIds = new Set(
    existingMembers.map((member) => member.userId),
  );

  existingMembers.forEach((member) => {
    alreadyMembers.push({
      email: member.user.email,
      name: member.user.name,
    });
  });

  const newStudents = studentsToAdd.filter(
    (user) => !existingMemberIds.has(user.id),
  );

  if (newStudents.length > 0) {
    await groupRepository.addGroupMembersAndIncrement(
      newGroup.id,
      newStudents.map((user) => user.id),
      GROUP_ROLE_IDS.MEMBER,
      newStudents.length,
    );

    successfullyAdded.push(
      ...newStudents.map((user) => ({ email: user.email, name: user.name })),
    );

    try {
      await teacherRepository.createNotificationRecord({
        title: `Added to group: ${newGroup.name}`,
        message: `You have been added to the group ${newGroup.name}.`,
        type: NotificationType.ANNOUNCEMENT,
        priority: NotificationPriority.NORMAL,
        senderId: userId,
        groupId: newGroup.id,
        recipientIds: newStudents.map((student) => student.id),
      });
    } catch (notifyError) {
      console.error("Failed to create group member notifications", notifyError);
    }
  }

  return {
    notFoundMembers: notFoundMembers || [],
    notStudents: notStudents || [],
    alreadyMembers: alreadyMembers || [],
    addedCount: newStudents.length,
    successfullyAdded: successfullyAdded || [],
  };
}

export async function getAllGroups(
  userId: string,
  query: TeacherGroupsQuery,
) {
  const takeNumber = query.take !== undefined ? Number(query.take) : 10;
  const skipNumber = query.skip !== undefined ? Number(query.skip) : 0;

  const where: Prisma.GroupWhereInput = {};

  if (query.groupType === "CLASS" || query.groupType === "LAB") {
    where.type = query.groupType as groupType;
  }

  if (query.searchValue) {
    const searchString = String(query.searchValue);
    where.OR = [
      { name: { contains: searchString, mode: "insensitive" } },
      { description: { contains: searchString, mode: "insensitive" } },
    ];
  }

  const groups = await groupRepository.findGroupsForTeacher(where);

  const authorizedGroups: typeof groups = [];

  for (const group of groups) {
    const canAccess = await canAccessGroupWithFallback(
      userId,
      group.id,
      group.creatorId,
      PERMISSIONS.GROUP_VIEW,
    );

    if (canAccess) {
      authorizedGroups.push(group);
    }
  }

  return authorizedGroups.slice(skipNumber, skipNumber + takeNumber);
}

export async function getGroupDetails(userId: string, groupId: string) {
  const groupData = await getGroupOrThrow(groupId);

  await assertCanAccessGroup(
    userId,
    groupData.id,
    groupData.creatorId,
    PERMISSIONS.GROUP_VIEW,
  );

  return groupData;
}

export async function getGroupMembers(
  userId: string,
  query: GroupMembersQuery,
) {
  const groupData = await getGroupOrThrow(query.groupId);

  await assertCanAccessGroup(
    userId,
    groupData.id,
    groupData.creatorId,
    PERMISSIONS.GROUP_VIEW,
  );

  const rawPage = query.page;
  const rawLimit = query.limit;
  const search = String(query.search || "").trim();

  const hasPaginationParams =
    rawPage !== undefined || rawLimit !== undefined || search.length > 0;

  // Backwards compatible: no pagination/search params → full list.
  if (!hasPaginationParams) {
    return groupRepository.findUsersInGroup(query.groupId);
  }

  const page = Math.max(1, rawPage ?? 1);
  const limit = Math.min(100, rawLimit && rawLimit > 0 ? rawLimit : 20);
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    memberGroups: {
      some: { groupId: query.groupId },
    },
  };

  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [total, members] = await Promise.all([
    groupRepository.countUsersInGroup(where),
    groupRepository.findUsersInGroupPage({ where, skip, take: limit }),
  ]);

  return {
    data: members,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getGroupExams(userId: string, groupId: string) {
  const groupData = await getGroupOrThrow(groupId);

  await assertCanAccessGroup(
    userId,
    groupData.id,
    groupData.creatorId,
    PERMISSIONS.GROUP_VIEW,
  );

  return groupRepository.findExamsForGroup(groupId);
}

export async function updateGroupDetails(
  userId: string,
  input: UpdateGroupInput,
) {
  const groupData = await getGroupOrThrow(input.groupId);

  await assertCanAccessGroup(
    userId,
    groupData.id,
    groupData.creatorId,
    PERMISSIONS.GROUP_EDIT,
  );

  const callerMembership = await teacherRepository.findGroupMembership(
    input.groupId,
    userId,
  );

  if (callerMembership?.roleId === GROUP_ROLE_IDS.COTEACHER) {
    throw new ForbiddenError(
      "Co-teachers are not allowed to change group properties",
    );
  }

  return groupRepository.updateGroupRecord({
    groupId: groupData.id,
    name: input.name,
    description: input.description ?? null,
    type: input.type,
    aiEnabled: input.aiEnabled,
    aiMaxMessages: input.aiMaxMessages,
    aiMaxTokens: input.aiMaxTokens,
  });
}

export async function deleteGroup(userId: string, groupId: string) {
  const groupData = await getGroupOrThrow(groupId);

  await assertCanAccessGroup(
    userId,
    groupData.id,
    groupData.creatorId,
    PERMISSIONS.GROUP_DELETE,
  );

  await assertGroupOwner(
    userId,
    groupData.id,
    groupData.creatorId,
    "Only the group owner can delete the group",
  );

  await groupRepository.deleteGroupAndDetachNotifications(groupId);

  return { success: true };
}

export async function removeMemberFromGroup(
  userId: string,
  input: RemoveMemberInput,
) {
  const groupData = await getGroupOrThrow(input.groupId);

  await assertCanAccessGroup(
    userId,
    groupData.id,
    groupData.creatorId,
    PERMISSIONS.GROUP_EDIT,
  );

  await assertGroupOwner(
    userId,
    groupData.id,
    groupData.creatorId,
    "Only the group owner can remove members from the group",
  );

  const existingMembership = await teacherRepository.findGroupMembership(
    input.groupId,
    input.userId,
  );

  if (!existingMembership) {
    throw new NotFoundError("Student is not a member of this group");
  }

  await groupRepository.removeGroupMemberAndDecrement(
    input.groupId,
    input.userId,
  );

  return { success: true };
}

export async function addCoTeacherToGroup(
  userId: string,
  input: AddCoTeacherInput,
) {
  const groupData = await getGroupOrThrow(input.groupId);

  await assertCanAccessGroup(
    userId,
    groupData.id,
    groupData.creatorId,
    PERMISSIONS.GROUP_EDIT,
  );

  const teacher = await teacherRepository.findUserByEmail(input.email);

  if (!teacher) {
    throw new NotFoundError("User not found");
  }

  if (teacher.globalRoleId !== GLOBAL_ROLE_IDS.ORG_TEACHER) {
    throw new ValidationError(
      "Only organization teachers can be added as co-teachers",
    );
  }

  await groupRepository.upsertCoTeacher(
    input.groupId,
    teacher.id,
    GROUP_ROLE_IDS.COTEACHER,
  );

  return {
    message: "Co-teacher added successfully",
    teacher: {
      id: teacher.id,
      email: teacher.email,
      name: teacher.name,
    },
  };
}

export async function addMemberToGroup(
  userId: string,
  input: AddMemberInput,
) {
  const emails = input.newEmails.split(",");

  const groupData = await getGroupOrThrow(input.groupId);

  await assertCanAccessGroup(
    userId,
    groupData.id,
    groupData.creatorId,
    PERMISSIONS.GROUP_EDIT,
  );

  const emailValidator = z.array(z.string().email().min(1).max(1000));
  const validationResult = emailValidator.safeParse(emails);

  if (!validationResult.success) {
    throw new ValidationError("Email Validation Failed");
  }

  const uniqueEmails = [...new Set(validationResult.data)];

  const users = await teacherRepository.findUsersByEmails(uniqueEmails);
  const userMap = new Map(users.map((user) => [user.email, user]));

  const studentIds: string[] = [];
  const notFoundStudents: string[] = [];

  for (const email of uniqueEmails) {
    const student = userMap.get(email);

    if (!student || student.globalRoleId !== GLOBAL_ROLE_IDS.ORG_STUDENT) {
      notFoundStudents.push(email);
    } else {
      studentIds.push(student.id);
    }
  }

  await groupRepository.createGroupMembersAndIncrement(
    groupData.id,
    studentIds,
    GROUP_ROLE_IDS.MEMBER,
  );

  try {
    if (studentIds.length > 0) {
      await teacherRepository.createNotificationRecord({
        title: `Added to group: ${groupData.name}`,
        message: `You have been added to the group ${groupData.name}.`,
        type: NotificationType.ANNOUNCEMENT,
        priority: NotificationPriority.NORMAL,
        senderId: userId,
        groupId: groupData.id,
        recipientIds: studentIds,
      });
    }
  } catch (notifyError) {
    console.error("Failed to create add-member notifications", notifyError);
  }

  return {
    message: "Members added successfully",
    notFoundStudents,
  };
}

// ---------------------------------------------------------------------------
// Student group views (delegates to the shared group service)
// ---------------------------------------------------------------------------

export async function getStudentGroups(
  userId: string,
  query: StudentGroupsQuery,
) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 12));
  const search = String(query.search || "");
  const type = String(query.type || "ALL");
  const aiEnabled = String(query.aiEnabled || "");
  const sort = String(query.sort || "newest");

  const accessibleGroupIds = await resolveAccessibleGroupIds(userId);

  if (accessibleGroupIds.length === 0) {
    return {
      groups: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  return getStudentGroupsForTeacher(userId, accessibleGroupIds, {
    page,
    limit,
    search: search || undefined,
    type,
    aiEnabled: aiEnabled || undefined,
    sort,
  });
}

export async function getStudentGroupsStats(userId: string) {
  const accessibleGroupIds = await resolveAccessibleGroupIds(userId);

  return getStudentGroupsStatsForTeacher(userId, accessibleGroupIds);
}

async function resolveAccessibleGroupIds(userId: string): Promise<string[]> {
  const allGroups = await teacherRepository.findAllGroupsForAccess();

  const accessibleGroupIds: string[] = [];

  for (const group of allGroups) {
    const canAccess = await canAccessGroupWithFallback(
      userId,
      group.id,
      group.creatorId,
      PERMISSIONS.GROUP_VIEW,
    );

    if (canAccess) {
      accessibleGroupIds.push(group.id);
    }
  }

  return accessibleGroupIds;
}
