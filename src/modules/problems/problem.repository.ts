import type { Prisma } from "../../../generated/prisma/client";
import prisma from "@/infrastructure/database/prisma";
import type { LanguageKey } from "@/utils/languageCatalog";

/** Fallback driver template used when a problem has no language template. */
export const DEFAULT_TEMPLATE_PROBLEM_ID =
  "1dc71649-3a7e-4e20-be71-32a7da08388e";

export type PracticeViewerRole = "ADMIN" | "TEACHER" | "STUDENT" | "ANONYMOUS";

export interface ProblemListFilters {
  searchValue?: string;
  tags?: string;
  difficulty?: string;
}

export interface ProblemListPagination {
  take: number;
  skip: number;
}

const VALID_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

function buildAccessCondition(
  viewerRole: PracticeViewerRole,
  viewerId?: string,
): Prisma.ProblemWhereInput | null {
  if (viewerRole === "ADMIN") {
    return null;
  }

  if (viewerRole === "TEACHER") {
    return {
      OR: [{ approvalStatus: "APPROVED" }, { ownerId: viewerId }],
    };
  }

  return {
    AND: [
      { visibility: "PUBLIC" },
      { approvalStatus: "APPROVED" },
      { hidden: false },
    ],
  };
}

function buildSearchCondition(searchValue: string): Prisma.ProblemWhereInput {
  const parsedNumber = Number(searchValue);

  const conditions: Prisma.ProblemWhereInput[] = [
    { title: { contains: searchValue, mode: "insensitive" } },
    { id: searchValue },
  ];

  if (!Number.isNaN(parsedNumber)) {
    conditions.push({ number: parsedNumber });
  }

  return { OR: conditions };
}

function buildWhere(
  viewerRole: PracticeViewerRole,
  viewerId: string | undefined,
  filters: ProblemListFilters,
): Prisma.ProblemWhereInput {
  const andConditions: Prisma.ProblemWhereInput[] = [{ number: { not: 0 } }];

  const accessCondition = buildAccessCondition(viewerRole, viewerId);
  if (accessCondition) {
    andConditions.push(accessCondition);
  }

  if (filters.searchValue && filters.searchValue.trim() !== "") {
    andConditions.push(buildSearchCondition(filters.searchValue.trim()));
  }

  const where: Prisma.ProblemWhereInput = { AND: andConditions };

  if (filters.tags) {
    where.tags = { some: { tag: { name: filters.tags } } };
  }

  const difficulty = filters.difficulty?.toUpperCase();
  if (
    difficulty &&
    (VALID_DIFFICULTIES as readonly string[]).includes(difficulty)
  ) {
    where.difficulty = difficulty as (typeof VALID_DIFFICULTIES)[number];
  }

  return where;
}

export async function findProblemsForViewer(params: {
  viewerRole: PracticeViewerRole;
  viewerId?: string;
  filters: ProblemListFilters;
  pagination: ProblemListPagination;
}) {
  const where = buildWhere(
    params.viewerRole,
    params.viewerId,
    params.filters,
  );

  return prisma.problem.findMany({
    where,
    take: params.pagination.take,
    skip: params.pagination.skip,
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      title: true,
      difficulty: true,
      tags: {
        select: {
          tag: true,
        },
      },
    },
  });
}

export async function findAllTags() {
  return prisma.tag.findMany({});
}

export async function findRunTestCases(problemId: string) {
  return prisma.runTestCase.findFirst({
    where: { problemId },
  });
}

export async function findProblemDetails(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      difficulty: true,
      tags: {
        select: {
          tag: true,
        },
      },
      performanceConstraints: {
        select: {
          cppTimeLimitMs: true,
          javaTimeLimitMs: true,
          pythonTimeLimitMs: true,
          jsTimeLimitMs: true,
          memoryLimitMB: true,
        },
      },
    },
  });
}

export async function problemExists(problemId: string): Promise<boolean> {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true },
  });

  return Boolean(problem);
}

export async function findSubmissionPage(params: {
  problemId: string;
  userId: string;
  skip: number;
  take: number;
}) {
  const where = { problemId: params.problemId, userId: params.userId };

  const [submissions, total] = await Promise.all([
    prisma.selfSubmission.findMany({
      where,
      select: {
        id: true,
        language: true,
        createdAt: true,
        passedTestcases: true,
        totalTestcases: true,
        status: true,
        executionTime: true,
        memory: true,
        sourceCode: true,
      },
      orderBy: { createdAt: "desc" },
      skip: params.skip,
      take: params.take,
    }),
    prisma.selfSubmission.count({ where }),
  ]);

  return { submissions, total };
}

export async function findDriverCodeTemplate(
  language: LanguageKey,
  problemId: string,
) {
  const direct = await prisma.driverCode.findUnique({
    where: {
      language_problemId: { language, problemId },
    },
    select: {
      template: true,
      language: true,
    },
  });

  if (direct) {
    return direct;
  }

  return prisma.driverCode.findUnique({
    where: {
      language_problemId: {
        language,
        problemId: DEFAULT_TEMPLATE_PROBLEM_ID,
      },
    },
    select: {
      template: true,
      language: true,
    },
  });
}

export async function findModuleProblemAccessInfo(moduleProblemId: string) {
  return prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
    select: {
      isUnlocked: true,
      availableFrom: true,
      availableUntil: true,
    },
  });
}

export async function findModuleProblemSebInfo(moduleProblemId: string) {
  return prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
    select: {
      module: {
        select: {
          lab: { select: { sebEnabled: true } },
        },
      },
    },
  });
}
