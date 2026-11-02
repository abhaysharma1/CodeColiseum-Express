import type { Prisma } from "../../../generated/prisma/client";
import prisma from "@/infrastructure/database/prisma";

type ModerationStatus = "PENDING" | "REJECTED" | "APPROVED";

function buildModerationWhere(params: {
  approvalStatus: ModerationStatus;
  searchValue?: string;
}): Prisma.ProblemWhereInput {
  const andConditions: Prisma.ProblemWhereInput[] = [];

  if (params.searchValue) {
    const search = params.searchValue;
    const parsedNumber = Number(search);
    const searchConditions: Prisma.ProblemWhereInput[] = [
      { title: { contains: search, mode: "insensitive" } },
      { id: search },
    ];

    if (!Number.isNaN(parsedNumber)) {
      searchConditions.push({ number: parsedNumber });
    }

    andConditions.push({ OR: searchConditions });
  }

  return {
    ownerType: "TEACHER",
    approvalStatus: params.approvalStatus,
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };
}

export async function findProblemsForModeration(params: {
  approvalStatus: ModerationStatus;
  searchValue?: string;
  take: number;
  skip: number;
}) {
  const where = buildModerationWhere(params);

  const [total, problems] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where,
      take: params.take,
      skip: params.skip,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        number: true,
        title: true,
        difficulty: true,
        approvalStatus: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        ownerId: true,
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  return { problems, total };
}

export async function findProblemModerationState(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, ownerType: true },
  });
}

export async function approveProblem(problemId: string, adminId: string) {
  return prisma.problem.update({
    where: { id: problemId },
    data: {
      approvalStatus: "APPROVED",
      visibility: "PUBLIC",
      approvedAt: new Date(),
      approvedById: adminId,
      rejectionReason: null,
    },
  });
}

export async function rejectProblem(problemId: string, reason: string) {
  return prisma.problem.update({
    where: { id: problemId },
    data: {
      approvalStatus: "REJECTED",
      visibility: "PRIVATE",
      rejectionReason: reason,
      approvedAt: null,
      approvedById: null,
    },
  });
}
