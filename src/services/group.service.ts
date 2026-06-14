import prisma from "@/utils/prisma";
import { Prisma } from "../../generated/prisma/client";
import { groupType, ExamStatus } from "../../generated/prisma/enums";

export interface StudentGroupsParams {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  aiEnabled?: string;
  sort?: string;
}

export interface StudentGroupCard {
  id: string;
  name: string;
  description: string | null;
  type: string;
  aiEnabled: boolean;
  createdAt: Date;
  updatedAt: Date | null;
  studentCount: number;
  assignedExamCount: number;
  assignedLabCount: number;
}

export interface StudentGroupsResult {
  groups: StudentGroupCard[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface StudentGroupsStats {
  totalGroups: number;
  totalStudents: number;
  aiEnabledGroups: number;
  activeAssignedExams: number;
  activeAssignedLabs: number;
}

export async function getStudentGroups(
  userId: string,
  groupIds: string[],
  params: StudentGroupsParams,
): Promise<StudentGroupsResult> {
  const { page, limit, search, type, aiEnabled, sort } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.GroupWhereInput = {
    id: { in: groupIds },
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (type && type !== "ALL") {
    where.type = type as groupType;
  }

  if (aiEnabled === "true") {
    where.aiEnabled = true;
  } else if (aiEnabled === "false") {
    where.aiEnabled = false;
  }

  let orderBy: Prisma.GroupOrderByWithRelationInput = { createdAt: "desc" };
  switch (sort) {
    case "oldest":
      orderBy = { createdAt: "asc" };
      break;
    case "mostStudents":
      orderBy = { noOfMembers: "desc" };
      break;
    case "leastStudents":
      orderBy = { noOfMembers: "asc" };
      break;
    case "alphabetical":
      orderBy = { name: "asc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  const [total, groups] = await Promise.all([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            examGroups: true,
            labAssignments: true,
          },
        },
      },
    }),
  ]);

  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      type: g.type,
      aiEnabled: g.aiEnabled,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      studentCount: g.noOfMembers,
      assignedExamCount: g._count.examGroups,
      assignedLabCount: g._count.labAssignments,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getStudentGroupsStats(
  userId: string,
  groupIds: string[],
): Promise<StudentGroupsStats> {
  const where: Prisma.GroupWhereInput = {
    id: { in: groupIds },
  };

  const [totalGroups, aiEnabledGroups, totalStudentsAgg] = await Promise.all([
    prisma.group.count({ where }),
    prisma.group.count({ where: { ...where, aiEnabled: true } }),
    prisma.group.aggregate({
      where,
      _sum: { noOfMembers: true },
    }),
  ]);

  const totalStudents = totalStudentsAgg._sum.noOfMembers ?? 0;

  const activeAssignedExams = await prisma.examGroup.count({
    where: {
      groupId: { in: groupIds },
      exam: {
        status: ExamStatus.active,
      },
    },
  });

  const activeAssignedLabs = await prisma.labAssignment.count({
    where: {
      groupId: { in: groupIds },
    },
  });

  return {
    totalGroups,
    totalStudents,
    aiEnabledGroups,
    activeAssignedExams,
    activeAssignedLabs,
  };
}
