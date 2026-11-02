import type { Prisma } from "../../../generated/prisma/client";
import { ProgrammingLanguage } from "../../../generated/prisma/enums";
import prisma from "@/infrastructure/database/prisma";
import { runInTransaction } from "@/infrastructure/database/transactions";
import type {
  DriverCodeEntry,
  ProblemSolution,
  ProblemTestCase,
} from "./teacher-problem.schema";

type TransactionClient = Prisma.TransactionClient;

export interface CreateProblemPersistenceInput {
  title: string;
  description: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  number: number;
  ownerId: string;
  tags: string[];
  publicCases: ProblemTestCase[];
  hiddenCases: ProblemTestCase[];
  driverCode: Record<string, DriverCodeEntry>;
  solutions: ProblemSolution[];
}

export interface UpdateProblemPersistenceInput {
  problemId: string;
  fields: Prisma.ProblemUpdateInput;
  tags?: string[];
  testCases?: {
    public: ProblemTestCase[];
    hidden: ProblemTestCase[];
  };
  driverCode?: Record<string, DriverCodeEntry>;
  solutions?: ProblemSolution[];
}

function hasDriverCode(entry: DriverCodeEntry): boolean {
  return Boolean(entry.header || entry.template || entry.footer);
}

function toDriverCodeRows(
  driverCode: Record<string, DriverCodeEntry>,
): { language: ProgrammingLanguage; header: string; template: string; footer: string }[] {
  return Object.entries(driverCode)
    .filter(([, entry]) => hasDriverCode(entry))
    .map(([language, entry]) => ({
      language: language as ProgrammingLanguage,
      header: entry.header,
      template: entry.template,
      footer: entry.footer,
    }));
}

async function upsertTags(
  client: TransactionClient,
  tags: string[],
): Promise<string[]> {
  if (tags.length === 0) {
    return [];
  }

  await client.tag.createMany({
    data: tags.map((name) => ({ name })),
    skipDuplicates: true,
  });

  const dbTags = await client.tag.findMany({
    where: { name: { in: tags } },
    select: { id: true },
  });

  return dbTags.map((tag) => tag.id);
}

export async function findMaxProblemNumber(): Promise<number> {
  const highest = await prisma.problem.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  return highest?.number ?? 0;
}

export async function createProblemAggregate(
  input: CreateProblemPersistenceInput,
): Promise<{ id: string }> {
  return runInTransaction(async (tx) => {
    const tagIds = await upsertTags(tx, input.tags);
    const driverRows = toDriverCodeRows(input.driverCode);

    const problem = await tx.problem.create({
      data: {
        title: input.title,
        description: input.description,
        difficulty: input.difficulty,
        number: input.number,
        isPublished: false,
        hidden: false,
        ownerType: "TEACHER",
        ownerId: input.ownerId,
        visibility: "PRIVATE",
        approvalStatus: "PENDING",
        tags:
          tagIds.length > 0
            ? { create: tagIds.map((tagId) => ({ tagId })) }
            : undefined,
        runTestCase:
          input.publicCases.length > 0
            ? { create: { cases: input.publicCases } }
            : undefined,
        testCase:
          input.hiddenCases.length > 0
            ? { create: { cases: input.hiddenCases } }
            : undefined,
        driverCode:
          driverRows.length > 0 ? { create: driverRows } : undefined,
        referenceSolutions:
          input.solutions.length > 0
            ? {
                create: input.solutions.map((solution) => ({
                  language: solution.language as ProgrammingLanguage,
                  code: solution.code,
                })),
              }
            : undefined,
      },
      select: { id: true },
    });

    return problem;
  });
}

export async function findProblemsByOwner(params: {
  ownerId: string;
  searchValue?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  take: number;
  skip: number;
}) {
  const andConditions: Prisma.ProblemWhereInput[] = [];

  if (params.approvalStatus) {
    andConditions.push({ approvalStatus: params.approvalStatus });
  }

  if (params.difficulty) {
    andConditions.push({ difficulty: params.difficulty });
  }

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

  const where: Prisma.ProblemWhereInput = {
    ownerId: params.ownerId,
    number: { not: 0 },
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };

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
        updatedAt: true,
        createdAt: true,
        tags: {
          select: { tag: true },
        },
      },
    }),
  ]);

  return { problems, total };
}

export async function findProblemForEditor(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      tags: { include: { tag: true } },
      runTestCase: true,
      testCase: true,
      driverCode: true,
      referenceSolutions: true,
      performanceConstraints: true,
      performanceTestCases: true,
    },
  });
}

export async function findProblemOwnership(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, ownerId: true, approvalStatus: true },
  });
}

export async function updateProblemAggregate(
  input: UpdateProblemPersistenceInput,
): Promise<void> {
  await runInTransaction(async (tx) => {
    if (Object.keys(input.fields).length > 0) {
      await tx.problem.update({
        where: { id: input.problemId },
        data: input.fields,
      });
    }

    if (input.tags !== undefined) {
      const tagIds = await upsertTags(tx, input.tags);
      await tx.problemTag.deleteMany({ where: { problemId: input.problemId } });

      if (tagIds.length > 0) {
        await tx.problemTag.createMany({
          data: tagIds.map((tagId) => ({
            problemId: input.problemId,
            tagId,
          })),
        });
      }
    }

    if (input.testCases !== undefined) {
      await tx.runTestCase.deleteMany({
        where: { problemId: input.problemId },
      });
      await tx.testCase.deleteMany({ where: { problemId: input.problemId } });

      if (input.testCases.public.length > 0) {
        await tx.runTestCase.create({
          data: {
            problemId: input.problemId,
            cases: input.testCases.public,
          },
        });
      }

      if (input.testCases.hidden.length > 0) {
        await tx.testCase.create({
          data: {
            problemId: input.problemId,
            cases: input.testCases.hidden,
          },
        });
      }
    }

    if (input.driverCode !== undefined) {
      await tx.driverCode.deleteMany({
        where: { problemId: input.problemId },
      });

      const driverRows = toDriverCodeRows(input.driverCode);

      if (driverRows.length > 0) {
        await tx.driverCode.createMany({
          data: driverRows.map((row) => ({
            problemId: input.problemId,
            ...row,
          })),
        });
      }
    }

    if (input.solutions !== undefined) {
      await tx.referenceSolution.deleteMany({
        where: { problemId: input.problemId },
      });

      if (input.solutions.length > 0) {
        await tx.referenceSolution.createMany({
          data: input.solutions.map((solution) => ({
            problemId: input.problemId,
            language: solution.language as ProgrammingLanguage,
            code: solution.code,
          })),
        });
      }
    }
  });
}

export async function findProblemUsage(problemId: string) {
  const [examUsage, moduleUsage] = await Promise.all([
    prisma.examProblem.findFirst({
      where: { problemId },
      select: { id: true },
    }),
    prisma.moduleProblem.findFirst({
      where: { problemId },
      select: { id: true },
    }),
  ]);

  return { usedInExam: Boolean(examUsage), usedInModule: Boolean(moduleUsage) };
}

export async function deleteProblem(problemId: string): Promise<void> {
  await prisma.problem.delete({ where: { id: problemId } });
}

export async function updateProblemApprovalStatus(
  problemId: string,
  approvalStatus: "PENDING",
): Promise<void> {
  await prisma.problem.update({
    where: { id: problemId },
    data: {
      approvalStatus,
      rejectionReason: null,
    },
  });
}
