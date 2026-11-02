import type { Prisma } from "../../../generated/prisma/client";
import { ProgrammingLanguage } from "../../../generated/prisma/enums";
import prisma from "@/infrastructure/database/prisma";
import { runInTransaction } from "@/infrastructure/database/transactions";
import type { BulkProblemInput } from "./admin.schema";

/* ------------------------------- Problems ------------------------------ */

export function findProblemById(problemId: string) {
  return prisma.problem.findUnique({ where: { id: problemId } });
}

export function findProblemWithReferenceSolutions(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    include: { referenceSolutions: true },
  });
}

export function findProblemForEditor(problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      tags: { include: { tag: true } },
      runTestCase: true,
      testCase: true,
      driverCode: true,
      referenceSolutions: true,
    },
  });
}

export function findAdminProblems(params: {
  searchValue?: string;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.ProblemWhereInput = {};

  if (params.searchValue && params.searchValue.trim() !== "") {
    const search = params.searchValue.trim();
    const parsedNumber = Number(search);

    const orConditions: Prisma.ProblemWhereInput[] = [
      { title: { contains: search, mode: "insensitive" } },
      { id: search },
    ];

    if (!Number.isNaN(parsedNumber)) {
      orConditions.push({ number: parsedNumber });
    }

    where.OR = orConditions;
  }

  return prisma.problem.findMany({
    where,
    take: params.take,
    skip: params.skip,
    select: {
      id: true,
      number: true,
      title: true,
      isPublished: true,
      difficulty: true,
      hidden: true,
    },
    orderBy: { number: "asc" },
  });
}

export function updateProblemHidden(problemId: string, hidden: boolean) {
  return prisma.problem.update({
    where: { id: problemId },
    data: { hidden },
  });
}

export function updateProblemPublished(
  problemId: string,
  isPublished: boolean,
) {
  return prisma.problem.update({
    where: { id: problemId },
    data: { isPublished },
  });
}

/** Highest number used by the bulk importer (`MAX(number)`). */
export async function findMaxProblemNumber(): Promise<number> {
  const result = await prisma.problem.aggregate({ _max: { number: true } });
  return result._max.number ?? 0;
}

/** Highest number used by the problem editor (latest row by number). */
export async function findLatestProblemNumber(): Promise<number> {
  const latest = await prisma.problem.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  return latest?.number ?? 0;
}

export function upsertTagNames(tagNames: string[]) {
  return prisma.tag.createMany({
    data: tagNames.map((name) => ({ name })),
    skipDuplicates: true,
  });
}

export function findTagIdsByNames(tagNames: string[]) {
  return prisma.tag.findMany({
    where: { name: { in: tagNames } },
    select: { id: true },
  });
}

export interface BulkProblemPersistenceInput {
  number: number;
  problem: BulkProblemInput;
  referenceLanguage: ProgrammingLanguage;
}

/**
 * Persists one imported problem and all of its relations atomically.
 */
export function createImportedProblem(input: BulkProblemPersistenceInput) {
  const { number, problem, referenceLanguage } = input;

  return runInTransaction(async (tx) => {
    const created = await tx.problem.create({
      data: {
        number,
        title: problem.title,
        description: problem.description,
        difficulty: problem.difficulty,
        source: problem.source ?? "Unknown",
        hidden: problem.hidden,
        ownerType: "ADMIN",
        visibility: "PUBLIC",
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
      },
    });

    for (const tagName of problem.tags) {
      const tag = await tx.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      });

      await tx.problemTag.create({
        data: {
          problemId: created.id,
          tagId: tag.id,
        },
      });
    }

    await tx.testCase.create({
      data: {
        problemId: created.id,
        cases: problem.hiddenTests,
      },
    });

    await tx.runTestCase.create({
      data: {
        problemId: created.id,
        cases: problem.publicTests,
      },
    });

    await tx.referenceSolution.create({
      data: {
        problemId: created.id,
        language: referenceLanguage,
        code: problem.referenceSolution.code,
      },
    });

    return created;
  });
}

export interface ProblemEditorPersistenceInput {
  problemId?: string;
  fields: {
    title: string;
    description: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    isPublished: boolean;
    hidden: boolean;
    ownerType: "ADMIN";
    visibility: "PUBLIC";
    approvalStatus: "APPROVED";
    approvedAt: Date;
    approvedById: string;
  };
  tagIds: string[];
  publicCases: { id: string; input: string; output: string }[];
  hiddenCases: { id: string; input: string; output: string }[];
  driverCode: {
    language: ProgrammingLanguage;
    header: string;
    template: string;
    footer: string;
  }[];
  solutions: { language: ProgrammingLanguage; code: string }[];
}

/**
 * Upserts an admin-authored problem. The relation collections are replaced
 * wholesale, matching the editor's "full document" save semantics.
 */
export async function saveEditorProblem(
  input: ProblemEditorPersistenceInput,
): Promise<{ id: string }> {
  const relationCreate = {
    tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
    runTestCase: { create: { cases: input.publicCases } },
    testCase: { create: { cases: input.hiddenCases } },
    driverCode: { create: input.driverCode },
    referenceSolutions: { create: input.solutions },
  };

  if (!input.problemId) {
    const number = (await findLatestProblemNumber()) + 1;

    return prisma.problem.create({
      data: {
        ...input.fields,
        number,
        ...relationCreate,
      },
      select: { id: true },
    });
  }

  const problemId = input.problemId;

  return runInTransaction(async (tx) => {
    await tx.problemTag.deleteMany({ where: { problemId } });
    await tx.runTestCase.deleteMany({ where: { problemId } });
    await tx.testCase.deleteMany({ where: { problemId } });
    await tx.driverCode.deleteMany({ where: { problemId } });
    await tx.referenceSolution.deleteMany({ where: { problemId } });

    return tx.problem.update({
      where: { id: problemId },
      data: {
        ...input.fields,
        ...relationCreate,
      },
      select: { id: true },
    });
  });
}

/* ----------------------------- Driver code ----------------------------- */

export function deleteDriverCodeForLanguage(
  problemId: string,
  language: ProgrammingLanguage,
) {
  return prisma.driverCode.deleteMany({
    where: { language, problemId },
  });
}

export function createDriverCode(input: {
  problemId: string;
  language: ProgrammingLanguage;
  header?: string;
  template?: string;
  footer?: string;
}) {
  return prisma.driverCode.create({
    data: {
      language: input.language,
      header: input.header,
      template: input.template,
      footer: input.footer,
      problemId: input.problemId,
    },
  });
}

/* ------------------------- Performance limits ------------------------- */

export function findPerformanceConstraints(problemId: string) {
  return prisma.performanceConstraints.findUnique({ where: { problemId } });
}

export function upsertPerformanceConstraints(
  data: Prisma.PerformanceConstraintsUncheckedCreateInput,
) {
  const limits = {
    cppTimeLimitMs: data.cppTimeLimitMs,
    javaTimeLimitMs: data.javaTimeLimitMs,
    pythonTimeLimitMs: data.pythonTimeLimitMs,
    jsTimeLimitMs: data.jsTimeLimitMs,
    memoryLimitMB: data.memoryLimitMB,
  };

  return prisma.performanceConstraints.upsert({
    where: { problemId: data.problemId },
    create: { problemId: data.problemId, ...limits },
    update: limits,
  });
}

export function deletePerformanceConstraints(problemId: string) {
  return prisma.performanceConstraints.delete({ where: { problemId } });
}

/* ------------------------ Performance test cases ----------------------- */

export function findPerformanceTestCases(problemId: string) {
  return prisma.performanceTestCase.findMany({
    where: { problemId },
    orderBy: { createdAt: "asc" },
  });
}

export function findPerformanceTestCaseById(id: string) {
  return prisma.performanceTestCase.findUnique({ where: { id } });
}

export function createPerformanceTestCase(input: {
  problemId: string;
  name: string;
  inputFileKey: string;
  outputFileKey: string;
}) {
  return prisma.performanceTestCase.create({ data: input });
}

export function deletePerformanceTestCase(id: string) {
  return prisma.performanceTestCase.delete({ where: { id } });
}

/* ------------------------------- Colleges ------------------------------ */

export function listColleges() {
  return prisma.college.findMany({ orderBy: { name: "asc" } });
}

export function findCollegeById(id: string) {
  return prisma.college.findUnique({ where: { id } });
}

export function findCollegeByName(name: string) {
  return prisma.college.findFirst({ where: { name } });
}

export function createCollege(name: string) {
  return prisma.college.create({ data: { name } });
}

/* -------------------------------- Users -------------------------------- */

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserIdByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
}

export function findUserForPasswordReset(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
}

export function findUserForCredentialsEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, globalRoleId: true },
  });
}

export function activateUserByEmail(email: string, globalRoleId: string) {
  return prisma.user.update({
    where: { email },
    data: { emailVerified: true, isOnboarded: true, globalRoleId },
    select: { id: true },
  });
}

export function activateUserByEmailWithSummary(
  email: string,
  globalRoleId: string,
) {
  return prisma.user.update({
    where: { email },
    data: { emailVerified: true, isOnboarded: true, globalRoleId },
    select: {
      id: true,
      name: true,
      email: true,
      globalRoleId: true,
    },
  });
}

export function updateUserGlobalRole(userId: string, globalRoleId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { globalRoleId },
    select: {
      id: true,
      name: true,
      email: true,
      globalRoleId: true,
    },
  });
}

/* ------------------------------- Accounts ------------------------------ */

export function findCredentialAccount(userId: string) {
  return prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });
}

export function updateAccountPassword(
  accountId: string,
  hashedPassword: string,
) {
  return prisma.account.update({
    where: { id: accountId },
    data: { password: hashedPassword },
  });
}

export function createCredentialAccount(input: {
  userId: string;
  hashedPassword: string;
}) {
  return prisma.account.create({
    data: {
      userId: input.userId,
      providerId: "credential",
      accountId: input.userId,
      password: input.hashedPassword,
    },
  });
}

export function deleteUserSessions(userId: string) {
  return prisma.session.deleteMany({ where: { userId } });
}

/* ------------------------------- Profiles ------------------------------ */

export interface StudentProfileInput {
  rollNumber: string;
  collegeId: string;
  branch: string | null;
  semester: number | null;
  batch: string | null;
}

export function upsertStudentProfile(
  userId: string,
  profile: StudentProfileInput,
) {
  return prisma.studentProfile.upsert({
    where: { userId },
    create: { userId, ...profile },
    update: profile,
  });
}

export function createStudentProfile(
  userId: string,
  profile: StudentProfileInput,
) {
  return prisma.studentProfile.create({
    data: { userId, ...profile },
  });
}

export interface TeacherProfileInput {
  employeeId: string | null;
  department: string | null;
  collegeId: string;
}

export function upsertTeacherProfile(
  userId: string,
  profile: TeacherProfileInput,
) {
  return prisma.teacherProfile.upsert({
    where: { userId },
    create: { userId, ...profile },
    update: profile,
  });
}

export function createTeacherProfile(
  userId: string,
  profile: TeacherProfileInput,
) {
  return prisma.teacherProfile.create({
    data: { userId, ...profile },
  });
}

/* -------------------------------- Groups ------------------------------- */

export function findGroupById(groupId: string) {
  return prisma.group.findUnique({ where: { id: groupId } });
}

export function findGroupMember(groupId: string, userId: string) {
  return prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
}

export function createGroupMember(input: {
  groupId: string;
  userId: string;
  roleId: string;
}) {
  return prisma.groupMember.create({ data: input });
}
