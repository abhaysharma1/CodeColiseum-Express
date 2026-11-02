import type { Prisma } from "../../../generated/prisma/client";
import prisma from "@/infrastructure/database/prisma";
import { runInTransaction } from "@/infrastructure/database/transactions";

// ── Labs ──

export interface CreateLabRecordInput {
  title: string;
  description: string | null;
  creatorId: string;
  aiEnabled: boolean;
  aiMaxMessages: number | null;
  aiMaxTokens: number | null;
  sebEnabled: boolean;
}

export interface ListLabsFilters {
  userId: string;
  scope?: string;
  searchValue?: string;
  take: number;
  skip: number;
}

function buildLabListWhere(filters: ListLabsFilters): Prisma.LabWhereInput {
  const where: Prisma.LabWhereInput =
    filters.scope === "owned"
      ? { creatorId: filters.userId }
      : {
          OR: [
            { creatorId: filters.userId },
            { teachers: { some: { userId: filters.userId } } },
          ],
        };

  if (filters.searchValue) {
    where.title = { contains: filters.searchValue, mode: "insensitive" };
  }

  return where;
}

export async function createLabRecord(input: CreateLabRecordInput) {
  return prisma.lab.create({ data: input });
}

export async function findLabsForTeacher(filters: ListLabsFilters) {
  const where = buildLabListWhere(filters);

  const [labs, total] = await Promise.all([
    prisma.lab.findMany({
      where,
      include: {
        _count: { select: { modules: true, assignments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: filters.take,
      skip: filters.skip,
    }),
    prisma.lab.count({ where }),
  ]);

  return { labs, total };
}

export async function findLabById(labId: string) {
  return prisma.lab.findUnique({ where: { id: labId } });
}

export async function findTeacherReadableLab(labId: string, userId: string) {
  return prisma.lab.findUnique({
    where: { id: labId },
    include: {
      teachers: {
        where: { userId },
        select: { id: true },
      },
    },
  });
}

export async function countModulesForLab(labId: string) {
  return prisma.labModule.count({ where: { labId } });
}

export async function updateLabRecord(
  labId: string,
  data: Prisma.LabUpdateInput,
) {
  return prisma.lab.update({ where: { id: labId }, data });
}

export async function deleteLabRecord(labId: string) {
  return prisma.lab.delete({ where: { id: labId } });
}

export async function findLabsOverviewStats(userId: string) {
  const labWhere: Prisma.LabWhereInput = {
    OR: [
      { creatorId: userId },
      { teachers: { some: { userId } } },
    ],
  };

  const [totalLabs, labsWithModules, totalGroups, totalStudents] =
    await Promise.all([
      prisma.lab.count({ where: labWhere }),
      prisma.lab.findMany({
        where: labWhere,
        select: { _count: { select: { modules: true } } },
      }),
      prisma.group.count({ where: { creatorId: userId } }),
      prisma.groupMember.count({
        where: { group: { creatorId: userId } },
      }),
    ]);

  return { totalLabs, labsWithModules, totalGroups, totalStudents };
}

// ── Assignments ──

export async function findLabAssignments(labId: string) {
  return prisma.labAssignment.findMany({
    where: { labId },
    include: { group: { select: { id: true, name: true } } },
  });
}

export async function findLabAssignmentGroupIds(labId: string) {
  const assignments = await prisma.labAssignment.findMany({
    where: { labId },
    select: { groupId: true },
  });

  return assignments.map((assignment) => assignment.groupId);
}

export async function findGroupSummary(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true },
  });
}

export async function replaceLabAssignment(labId: string, groupId: string) {
  await runInTransaction(async (tx) => {
    await tx.labAssignment.deleteMany({ where: { labId } });
    await tx.labAssignment.create({ data: { labId, groupId } });
  });
}

export async function deleteLabAssignments(labId: string) {
  return prisma.labAssignment.deleteMany({ where: { labId } });
}

// ── Modules ──

export async function findLabModuleById(moduleId: string) {
  return prisma.labModule.findUnique({ where: { id: moduleId } });
}

export async function findTeacherReadableModule(
  moduleId: string,
  userId: string,
) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    include: {
      lab: {
        include: {
          teachers: {
            where: { userId },
            select: { id: true },
          },
        },
      },
    },
  });
}

export async function findTeacherWritableModule(moduleId: string) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    include: { lab: { select: { creatorId: true } } },
  });
}

export async function findModuleByLabAndWeek(labId: string, weekNumber: number) {
  return prisma.labModule.findUnique({
    where: { labId_weekNumber: { labId, weekNumber } },
  });
}

export interface CreateLabModuleRecordInput {
  labId: string;
  title: string;
  description: string | null;
  weekNumber: number;
  orderIndex: number | null;
  unlockAt: Date | null;
  dueAt: Date | null;
  assessmentExamId: string | null;
}

export async function createLabModule(input: CreateLabModuleRecordInput) {
  return prisma.labModule.create({ data: input });
}

export async function updateLabModule(
  moduleId: string,
  data: Prisma.LabModuleUpdateInput,
) {
  return prisma.labModule.update({ where: { id: moduleId }, data });
}

export async function deleteLabModule(moduleId: string) {
  return prisma.labModule.delete({ where: { id: moduleId } });
}

export async function findModulesForLab(labId: string) {
  return prisma.labModule.findMany({
    where: { labId },
    include: { _count: { select: { problems: true } } },
    orderBy: [{ orderIndex: "asc" }, { weekNumber: "asc" }],
  });
}

export async function countModuleProblems(moduleId: string) {
  return prisma.moduleProblem.count({ where: { moduleId } });
}

export async function findModuleProblemsWithProblem(moduleId: string) {
  return prisma.moduleProblem.findMany({
    where: { moduleId },
    include: {
      problem: {
        select: { id: true, number: true, title: true, difficulty: true },
      },
    },
    orderBy: { orderIndex: "asc" },
  });
}

export async function findProblemsForModuleAdd(problemIds: string[]) {
  return prisma.problem.findMany({
    where: { id: { in: problemIds } },
    select: { id: true, ownerId: true, visibility: true, approvalStatus: true },
  });
}

export async function createModuleProblems(
  rows: { moduleId: string; problemId: string; orderIndex: number }[],
) {
  return prisma.moduleProblem.createMany({ data: rows, skipDuplicates: true });
}

export async function updateModuleProblemRecord(
  moduleProblemId: string,
  data: Prisma.ModuleProblemUpdateInput,
) {
  return prisma.moduleProblem.update({
    where: { id: moduleProblemId },
    data,
  });
}

export async function deleteModuleProblemRecord(moduleProblemId: string) {
  return prisma.moduleProblem.delete({ where: { id: moduleProblemId } });
}

export async function findTeacherReadableModuleProblem(
  moduleProblemId: string,
  userId: string,
) {
  return prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
    include: {
      module: {
        include: {
          lab: {
            include: {
              teachers: {
                where: { userId },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function findTeacherWritableModuleProblem(moduleProblemId: string) {
  return prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
    include: {
      module: {
        include: { lab: { select: { creatorId: true } } },
      },
    },
  });
}

export async function findModuleProblemsBrief(moduleId: string) {
  return prisma.moduleProblem.findMany({
    where: { moduleId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, problemId: true, orderIndex: true },
  });
}

export async function findModuleProblemWithModule(moduleProblemId: string) {
  return prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
    include: {
      module: {
        include: { lab: { select: { id: true, title: true, description: true } } },
      },
      problem: { select: { id: true } },
    },
  });
}

export async function findModuleProblemById(moduleProblemId: string) {
  return prisma.moduleProblem.findUnique({ where: { id: moduleProblemId } });
}

export async function findModuleProblemInModule(
  moduleProblemId: string,
  moduleId: string,
) {
  return prisma.moduleProblem.findFirst({
    where: { id: moduleProblemId, moduleId },
    include: {
      module: { select: { id: true } },
      problem: { select: { id: true, number: true, title: true } },
    },
  });
}

export async function findModuleForStudent(moduleId: string) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
      unlockAt: true,
      assessmentExamId: true,
      labId: true,
      title: true,
      weekNumber: true,
      dueAt: true,
      description: true,
      orderIndex: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function findModuleBrief(moduleId: string) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    select: { labId: true, assessmentExamId: true },
  });
}

export async function findLabSebFlag(labId: string) {
  return prisma.lab.findUnique({
    where: { id: labId },
    select: { sebEnabled: true },
  });
}

// ── Assessments ──

export async function findExamWithCreator(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, creatorId: true },
  });
}

export async function findAssessmentLink(moduleId: string) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    select: {
      assessmentExamId: true,
      lab: { select: { creatorId: true } },
    },
  });
}

export async function findExamSummary(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      durationMin: true,
    },
  });
}

export async function setModuleAssessmentExam(
  moduleId: string,
  assessmentExamId: string | null,
) {
  return prisma.labModule.update({
    where: { id: moduleId },
    data: { assessmentExamId },
  });
}

export interface CreateAssessmentExamInput {
  title: string;
  description: string;
  creatorId: string;
  startDate: Date;
  endDate: Date;
  durationMin: number;
}

export async function createAssessmentExamForModule(
  moduleId: string,
  labId: string,
  input: CreateAssessmentExamInput,
) {
  return runInTransaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        title: input.title,
        description: input.description,
        isPublished: false,
        creatorId: input.creatorId,
        startDate: input.startDate,
        endDate: input.endDate,
        durationMin: input.durationMin,
        sebEnabled: false,
        status: "scheduled",
      },
    });

    const assignments = await tx.labAssignment.findMany({
      where: { labId },
      select: { groupId: true },
    });

    if (assignments.length > 0) {
      await tx.examGroup.createMany({
        data: assignments.map((assignment) => ({
          examId: exam.id,
          groupId: assignment.groupId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.labModule.update({
      where: { id: moduleId },
      data: { assessmentExamId: exam.id },
    });

    return exam;
  });
}

// ── Analytics ──

export async function findGroupMemberUserIds(groupId: string) {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });

  return members.map((member) => member.userId);
}

export async function findModuleProblemsWithAllProgress(moduleId: string) {
  return prisma.moduleProblem.findMany({
    where: { moduleId },
    include: {
      problem: { select: { id: true, number: true, title: true } },
      progress: {
        select: {
          userId: true,
          attemptCount: true,
          isSolved: true,
        },
      },
    },
    orderBy: { orderIndex: "asc" },
  });
}

export async function findGroupMembersWithUser(groupId: string) {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: {
      user: {
        select: { id: true, name: true },
      },
    },
  });

  return members
    .map((member) => member.user)
    .filter(
      (user): user is { id: string; name: string } =>
        typeof user.name === "string" && user.name.length > 0,
    );
}

export async function findLabAssignmentsWithMembers(labId: string) {
  const assignments = await prisma.labAssignment.findMany({
    where: { labId },
    select: {
      group: {
        select: {
          members: {
            select: {
              user: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  });

  const studentMap = new Map<string, { id: string; name: string }>();

  for (const assignment of assignments) {
    for (const member of assignment.group.members) {
      const user = member.user;

      if (
        typeof user.name === "string" &&
        user.name.length > 0 &&
        !studentMap.has(user.id)
      ) {
        studentMap.set(user.id, { id: user.id, name: user.name });
      }
    }
  }

  return Array.from(studentMap.values());
}

export async function findModuleWithProblemIds(moduleId: string) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    select: {
      labId: true,
      problems: { select: { id: true } },
    },
  });
}

export async function groupSolvedProblemsByStudent(
  studentIds: string[],
  moduleProblemIds: string[],
) {
  if (studentIds.length === 0) {
    return [];
  }

  return prisma.moduleProblemProgress.groupBy({
    by: ["userId"],
    where: {
      userId: { in: studentIds },
      moduleProblemId: { in: moduleProblemIds },
      isSolved: true,
    },
    _count: { _all: true },
  });
}

export async function findExamAttemptsForAssessment(
  examId: string,
  userIds?: string[],
) {
  return prisma.examAttempt.findMany({
    where: {
      examId,
      ...(userIds ? { studentId: { in: userIds } } : {}),
    },
    select: {
      studentId: true,
      totalScore: true,
      status: true,
    },
  });
}

// ── Lab teacher management ──

export async function searchTeachersByRole(term: string, roleId: string) {
  return prisma.user.findMany({
    where: {
      globalRoleId: roleId,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true },
    take: 20,
  });
}

export async function findUserForTeacher(identifier: {
  email?: string;
  userId?: string;
}) {
  return prisma.user.findUnique({
    where: identifier.userId
      ? { id: identifier.userId }
      : { email: identifier.email! },
    select: { id: true, name: true, email: true, globalRoleId: true },
  });
}

export async function findUserRole(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { globalRoleId: true },
  });
}

export async function createLabTeacher(
  labId: string,
  teacherUserId: string,
  addedById: string,
) {
  return prisma.labTeacher.create({
    data: { labId, userId: teacherUserId, addedById },
  });
}

export async function deleteLabTeacher(labId: string, teacherUserId: string) {
  return prisma.labTeacher.delete({
    where: { labId_userId: { labId, userId: teacherUserId } },
  });
}

export async function findLabTeachers(labId: string) {
  return prisma.labTeacher.findMany({
    where: { labId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      addedBy: { select: { id: true, name: true } },
    },
    orderBy: { addedAt: "desc" },
  });
}

// ── Student access + reads ──

export async function findStudentGroupIds(userId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });

  return memberships.map((membership) => membership.groupId);
}

export async function findLabIdsForGroups(groupIds: string[]) {
  if (groupIds.length === 0) return [];

  const assignments = await prisma.labAssignment.findMany({
    where: { groupId: { in: groupIds } },
    select: { labId: true },
  });

  return [
    ...new Set<string>(assignments.map((assignment) => assignment.labId)),
  ];
}

export async function findLabsWithModulesForStudent(labIds: string[]) {
  return prisma.lab.findMany({
    where: { id: { in: labIds } },
    include: {
      modules: {
        include: { _count: { select: { problems: true } } },
        orderBy: [{ orderIndex: "asc" }, { weekNumber: "asc" }],
      },
      creator: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findLabWithModulesForStudent(labId: string) {
  return prisma.lab.findUnique({
    where: { id: labId },
    include: {
      modules: {
        include: { _count: { select: { problems: true } } },
        orderBy: [{ orderIndex: "asc" }, { weekNumber: "asc" }],
      },
    },
  });
}

export async function countSolvedModuleProblems(
  userId: string,
  moduleId: string,
) {
  return prisma.moduleProblemProgress.count({
    where: {
      moduleProblem: { moduleId },
      userId,
      isSolved: true,
    },
  });
}

export async function findModuleUnlockAt(moduleId: string) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    select: { unlockAt: true },
  });
}

export async function findExamAttemptStatus(examId: string, studentId: string) {
  return prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
    select: { status: true },
  });
}

export async function findModuleProblemProgressForStudent(
  userId: string,
  moduleId: string,
) {
  return prisma.moduleProblemProgress.findMany({
    where: {
      moduleProblem: { moduleId },
      userId,
    },
    select: {
      moduleProblemId: true,
      attemptCount: true,
      isSolved: true,
      lastAttemptAt: true,
    },
    orderBy: { lastAttemptAt: "desc" },
  });
}

export async function findModuleProblemsWithStudentProgress(
  moduleId: string,
  userId: string,
) {
  return prisma.moduleProblem.findMany({
    where: { moduleId },
    include: {
      problem: {
        select: { id: true, number: true, title: true, difficulty: true },
      },
      progress: {
        where: { userId },
        select: {
          attemptCount: true,
          isSolved: true,
          lastAttemptAt: true,
        },
      },
    },
    orderBy: { orderIndex: "asc" },
  });
}

export async function findModuleProblemProgressUnique(
  userId: string,
  moduleProblemId: string,
) {
  return prisma.moduleProblemProgress.findUnique({
    where: {
      userId_moduleProblemId: { userId, moduleProblemId },
    },
  });
}

export async function findModuleProblemProgressFirst(
  userId: string,
  moduleId: string,
) {
  return prisma.moduleProblemProgress.findFirst({
    where: { userId, moduleProblem: { moduleId } },
    select: { id: true },
  });
}

export async function findModuleWithLabAssignments(moduleId: string) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    select: {
      lab: {
        select: { assignments: { select: { groupId: true } } },
      },
    },
  });
}

export async function findGroupMembershipForStudent(
  studentId: string,
  groupIds: string[],
) {
  if (groupIds.length === 0) return null;

  return prisma.groupMember.findFirst({
    where: { userId: studentId, groupId: { in: groupIds } },
    select: { id: true },
  });
}

export async function findModuleProblemsForAttempts(moduleId: string) {
  return prisma.moduleProblem.findMany({
    where: { moduleId },
    include: {
      problem: {
        select: { id: true, number: true, title: true, difficulty: true },
      },
    },
    orderBy: { orderIndex: "asc" },
  });
}

export async function findModuleProgressRows(
  studentId: string,
  moduleProblemIds: string[],
) {
  if (moduleProblemIds.length === 0) return [];

  return prisma.moduleProblemProgress.findMany({
    where: {
      userId: studentId,
      moduleProblemId: { in: moduleProblemIds },
    },
  });
}

export async function findSubmissionsByIds(submissionIds: string[]) {
  if (submissionIds.length === 0) return [];

  return prisma.selfSubmission.findMany({
    where: { id: { in: submissionIds } },
    select: {
      id: true,
      status: true,
      passedTestcases: true,
      totalTestcases: true,
      language: true,
      executionTime: true,
      memory: true,
      createdAt: true,
      sourceCode: true,
      stderr: true,
    },
  });
}

export async function findStudentName(studentId: string) {
  return prisma.user.findUnique({
    where: { id: studentId },
    select: { name: true },
  });
}

export async function findStudentSubmissionsForProblem(
  studentId: string,
  problemId: string,
) {
  return prisma.selfSubmission.findMany({
    where: {
      userId: studentId,
      problemId,
      status: { notIn: ["PENDING", "RUNNING"] },
    },
    select: {
      id: true,
      status: true,
      passedTestcases: true,
      totalTestcases: true,
      language: true,
      executionTime: true,
      memory: true,
      createdAt: true,
      sourceCode: true,
      stderr: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

// ── Module progress persistence ──

export async function upsertModuleProblemProgressRecord(params: {
  userId: string;
  moduleProblemId: string;
  submissionId: string;
  isAccepted: boolean;
}) {
  return runInTransaction(async (tx) => {
    const existing = await tx.moduleProblemProgress.findUnique({
      where: {
        userId_moduleProblemId: {
          userId: params.userId,
          moduleProblemId: params.moduleProblemId,
        },
      },
    });

    if (existing?.latestSubmissionId === params.submissionId) {
      return;
    }

    const now = new Date();
    const updateData: Prisma.ModuleProblemProgressUpdateInput = {
      attemptCount: { increment: 1 },
      latestSubmissionId: params.submissionId,
      lastAttemptAt: now,
    };

    if (params.isAccepted && !existing?.isSolved) {
      updateData.isSolved = true;
      updateData.solvedAt = now;
      updateData.bestSubmissionId = params.submissionId;
    }

    await tx.moduleProblemProgress.upsert({
      where: {
        userId_moduleProblemId: {
          userId: params.userId,
          moduleProblemId: params.moduleProblemId,
        },
      },
      create: {
        userId: params.userId,
        moduleProblemId: params.moduleProblemId,
        attemptCount: 1,
        isSolved: params.isAccepted,
        solvedAt: params.isAccepted ? now : null,
        latestSubmissionId: params.submissionId,
        bestSubmissionId: params.isAccepted ? params.submissionId : null,
        lastAttemptAt: now,
      },
      update: updateData,
    });
  });
}

// ── Module export ──

export async function findModuleForExport(moduleId: string) {
  return prisma.labModule.findUnique({
    where: { id: moduleId },
    include: {
      lab: {
        include: {
          assignments: {
            include: {
              group: { select: { id: true, name: true } },
            },
          },
        },
      },
      problems: {
        include: {
          problem: {
            select: { id: true, number: true, title: true },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
}

export async function findGroupMembersWithProfile(groupIds: string[]) {
  if (groupIds.length === 0) return [];

  return prisma.groupMember.findMany({
    where: { groupId: { in: groupIds } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: { select: { rollNumber: true } },
        },
      },
      group: { select: { id: true, name: true } },
    },
  });
}

export async function findModuleProblemProgressSlim(moduleId: string) {
  return prisma.moduleProblemProgress.findMany({
    where: { moduleProblem: { moduleId } },
    select: {
      userId: true,
      moduleProblemId: true,
      isSolved: true,
    },
  });
}

export async function findExamTitle(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    select: { title: true },
  });
}

export async function findExamAttemptScores(examId: string) {
  return prisma.examAttempt.findMany({
    where: { examId },
    select: { studentId: true, totalScore: true },
  });
}
