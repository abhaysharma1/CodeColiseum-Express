import prisma from "@/infrastructure/database/prisma";
import { runInTransaction } from "@/infrastructure/database/transactions";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import type { Prisma } from "../../../generated/prisma/client";
import type { MarketplaceQuery } from "./marketplace.schema";

interface PublicLabListItem {
  id: string;
  title: string;
  description: string | null;
  creatorId: string;
  creatorName: string;
  difficulty: string | null;
  subject: string | null;
  programmingLanguage: string | null;
  modulesCount: number;
  problemsCount: number;
  duplicateCount: number;
  averageRating: number;
  ratingCount: number;
  publishedAt: string;
  updatedAt: string;
  tags: { id: string; name: string }[];
}

interface PublicLabPreview {
  id: string;
  title: string;
  description: string | null;
  creator: { id: string; name: string };
  difficulty: string | null;
  subject: string | null;
  programmingLanguage: string | null;
  estimatedDuration: number | null;
  modulesCount: number;
  modules: {
    id: string;
    title: string;
    description: string | null;
    weekNumber: number;
    orderIndex: number | null;
    problemsCount: number;
    problems: {
      id: string;
      problemId: string;
      orderIndex: number | null;
      problem: { id: string; number: number; title: string; difficulty: string };
    }[];
  }[];
  duplicateCount: number;
  averageRating: number;
  ratingCount: number;
  publishedAt: string;
  tags: { id: string; name: string }[];
}

interface LabAnalytics {
  duplicateCount: number;
  averageRating: number;
  ratingCount: number;
  reviewCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

// ── Query public labs ──

export async function getPublicLabs(
  query: MarketplaceQuery,
): Promise<{ data: PublicLabListItem[]; total: number; page: number; pages: number }> {
  const where: Prisma.LabWhereInput = {
    visibility: "PUBLIC",
    isArchived: false,
  };

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  if (query.difficulty) {
    where.difficulty = query.difficulty;
  }

  if (query.subject) {
    where.subject = { contains: query.subject, mode: "insensitive" };
  }

  if (query.programmingLanguage) {
    where.programmingLanguage = { contains: query.programmingLanguage, mode: "insensitive" };
  }

  if (query.tagIds && query.tagIds.length > 0) {
    where.tags = { some: { tagId: { in: query.tagIds } } };
  }

  let orderBy: Prisma.LabOrderByWithRelationInput;
  switch (query.sort) {
    case "newest":
      orderBy = { publishedAt: "desc" };
      break;
    case "updated":
      orderBy = { updatedAt: "desc" };
      break;
    case "most_duplicated":
      orderBy = { duplicateCount: "desc" };
      break;
    case "highest_rated":
      orderBy = { averageRating: "desc" };
      break;
    default:
      orderBy = { publishedAt: "desc" };
  }

  const take = query.limit;
  const skip = (query.page - 1) * take;

  const [labs, total] = await Promise.all([
    prisma.lab.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        modules: {
          include: { _count: { select: { problems: true } } },
        },
        _count: { select: { modules: true } },
      },
      orderBy,
      take,
      skip,
    }),
    prisma.lab.count({ where }),
  ]);

  const data = labs.map((lab) => {
    const problemsCount = lab.modules.reduce(
      (sum: number, m) => sum + m._count.problems,
      0,
    );
    return {
      id: lab.id,
      title: lab.title,
      description: lab.description,
      creatorId: lab.creator.id,
      creatorName: lab.creator.name,
      difficulty: lab.difficulty,
      subject: lab.subject,
      programmingLanguage: lab.programmingLanguage,
      modulesCount: lab._count.modules,
      problemsCount,
      duplicateCount: lab.duplicateCount,
      averageRating: lab.averageRating,
      ratingCount: lab.ratingCount,
      publishedAt: lab.publishedAt?.toISOString() ?? "",
      updatedAt: lab.updatedAt.toISOString(),
      tags: lab.tags.map((lt) => ({ id: lt.tag.id, name: lt.tag.name })),
    };
  });

  return { data, total, page: query.page, pages: Math.ceil(total / take) };
}

// ── Get single public lab for preview ──

export async function getPublicLabPreview(labId: string): Promise<PublicLabPreview> {
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    include: {
      creator: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { id: true, name: true } } } },
      modules: {
        orderBy: [{ orderIndex: "asc" }, { weekNumber: "asc" }],
        include: {
          problems: {
            orderBy: { orderIndex: "asc" },
            include: {
              problem: {
                select: { id: true, number: true, title: true, difficulty: true },
              },
            },
          },
          _count: { select: { problems: true } },
        },
      },
    },
  });

  if (!lab || lab.visibility !== "PUBLIC") {
    throw new NotFoundError("Lab not found or not public");
  }

  return {
    id: lab.id,
    title: lab.title,
    description: lab.description,
    creator: { id: lab.creator.id, name: lab.creator.name },
    difficulty: lab.difficulty,
    subject: lab.subject,
    programmingLanguage: lab.programmingLanguage,
    estimatedDuration: lab.estimatedDuration,
    modulesCount: lab.modules.length,
    modules: lab.modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      weekNumber: m.weekNumber,
      orderIndex: m.orderIndex,
      problemsCount: m._count.problems,
      problems: m.problems.map((mp) => ({
        id: mp.id,
        problemId: mp.problemId,
        orderIndex: mp.orderIndex,
        problem: mp.problem,
      })),
    })),
    duplicateCount: lab.duplicateCount,
    averageRating: lab.averageRating,
    ratingCount: lab.ratingCount,
    publishedAt: lab.publishedAt?.toISOString() ?? "",
    tags: lab.tags.map((lt) => ({ id: lt.tag.id, name: lt.tag.name })),
  };
}

// ── Publish a lab ──

export async function publishLab(userId: string, labId: string) {
  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) {
    throw new NotFoundError("Lab not found");
  }
  if (lab.creatorId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  return prisma.lab.update({
    where: { id: labId },
    data: {
      visibility: "PUBLIC",
      publishedAt: new Date(),
    },
  });
}

// ── Unpublish a lab ──

export async function unpublishLab(userId: string, labId: string) {
  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) {
    throw new NotFoundError("Lab not found");
  }
  if (lab.creatorId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  return prisma.lab.update({
    where: { id: labId },
    data: { visibility: "PRIVATE" },
  });
}

// ── Duplicate a lab ──

export async function duplicateLab(userId: string, sourceLabId: string) {
  const sourceLab = await prisma.lab.findUnique({
    where: { id: sourceLabId },
    include: {
      modules: {
        include: {
          problems: {
            include: { problem: { select: { id: true } } },
          },
        },
      },
      tags: { select: { tagId: true } },
    },
  });

  if (!sourceLab || sourceLab.visibility !== "PUBLIC") {
    throw new NotFoundError("Lab not found or not public");
  }

  if (sourceLab.creatorId === userId) {
    throw new ValidationError("Cannot duplicate your own lab");
  }

  const result = await runInTransaction(async (tx) => {
    const newLab = await tx.lab.create({
      data: {
        title: sourceLab.title,
        description: sourceLab.description,
        creatorId: userId,
        aiEnabled: sourceLab.aiEnabled,
        aiMaxMessages: sourceLab.aiMaxMessages,
        aiMaxTokens: sourceLab.aiMaxTokens,
        visibility: "PRIVATE",
        originalLabId: sourceLabId,
        difficulty: sourceLab.difficulty,
        subject: sourceLab.subject,
        programmingLanguage: sourceLab.programmingLanguage,
        estimatedDuration: sourceLab.estimatedDuration,
      },
    });

    for (const module of sourceLab.modules) {
      const newModule = await tx.labModule.create({
        data: {
          labId: newLab.id,
          title: module.title,
          description: module.description,
          weekNumber: module.weekNumber,
          orderIndex: module.orderIndex,
          unlockAt: module.unlockAt,
          dueAt: module.dueAt,
        },
      });

      if (module.problems.length > 0) {
        await tx.moduleProblem.createMany({
          data: module.problems.map((mp) => ({
            moduleId: newModule.id,
            problemId: mp.problemId,
            orderIndex: mp.orderIndex,
          })),
        });
      }
    }

    if (sourceLab.tags.length > 0) {
      await tx.labTag.createMany({
        data: sourceLab.tags.map((lt) => ({
          labId: newLab.id,
          tagId: lt.tagId,
        })),
      });
    }

    await tx.lab.update({
      where: { id: sourceLabId },
      data: { duplicateCount: { increment: 1 } },
    });

    return newLab;
  });

  return result;
}

// ── Check if user has already duplicated a lab ──

export async function hasUserDuplicated(userId: string, labId: string): Promise<boolean> {
  const count = await prisma.lab.count({
    where: {
      originalLabId: labId,
      creatorId: userId,
    },
  });
  return count > 0;
}

// ── Get user's duplicate of a lab ──

export async function getUserDuplicate(userId: string, labId: string) {
  return prisma.lab.findFirst({
    where: {
      originalLabId: labId,
      creatorId: userId,
    },
    select: { id: true, title: true, createdAt: true },
  });
}

// ── Rate a lab ──

export async function rateLab(
  userId: string,
  labId: string,
  score: number,
  review?: string,
) {
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    select: { id: true, visibility: true, creatorId: true },
  });
  if (!lab || lab.visibility !== "PUBLIC") {
    throw new NotFoundError("Lab not found or not public");
  }

  if (lab.creatorId === userId) {
    throw new ValidationError("Cannot rate your own lab");
  }

  return runInTransaction(async (tx) => {
    await tx.labRating.upsert({
      where: { labId_userId: { labId, userId } },
      create: { labId, userId, score, review },
      update: { score, review, updatedAt: new Date() },
    });

    const aggregate = await tx.labRating.aggregate({
      where: { labId },
      _avg: { score: true },
      _count: true,
    });

    await tx.lab.update({
      where: { id: labId },
      data: {
        averageRating: aggregate._avg.score ?? 0,
        ratingCount: aggregate._count,
      },
    });

    return { averageRating: aggregate._avg.score ?? 0, ratingCount: aggregate._count };
  });
}

// ── Get lab analytics for owner ──

export async function getLabAnalytics(userId: string, labId: string): Promise<LabAnalytics> {
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    select: {
      creatorId: true,
      duplicateCount: true,
      averageRating: true,
      ratingCount: true,
      publishedAt: true,
      updatedAt: true,
      _count: { select: { ratings: true } },
    },
  });

  if (!lab) {
    throw new NotFoundError("Lab not found");
  }

  if (lab.creatorId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  return {
    duplicateCount: lab.duplicateCount,
    averageRating: lab.averageRating,
    ratingCount: lab.ratingCount,
    reviewCount: lab._count.ratings,
    publishedAt: lab.publishedAt?.toISOString() ?? null,
    updatedAt: lab.updatedAt.toISOString(),
  };
}

// ── Get all tags ──

export async function getAllTags() {
  return prisma.tag.findMany({
    orderBy: { name: "asc" },
  });
}
