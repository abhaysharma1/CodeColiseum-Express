import type { Prisma } from "../../../generated/prisma/client";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import { verifySEB, type SebRequestContext } from "@/utils/exam.utils";
import * as marketplaceService from "@/modules/marketplace/marketplace.service";
import type {
  AssessmentDTO,
  AssessmentResultsDTO,
  ModuleStatus,
  ProblemAnalyticsEntry,
  SortOrder,
  StudentModuleAttemptsResponse,
  StudentProblemSubmissionsResponse,
  StudentProgressListResponse,
  StudentProgressSortBy,
} from "@/types/lab.types";
import * as labRepository from "./lab.repository";
import type {
  AddModuleProblemsInput,
  AddLabTeacherInput,
  AssignAssessmentInput,
  CreateAssessmentInput,
  CreateLabInput,
  CreateModuleInput,
  ListLabsQuery,
  StudentProgressQuery,
  UpdateLabInput,
  UpdateModuleInput,
  UpdateModuleProblemAccessInput,
} from "./lab.schema";

// ── Shared helpers ──

export function computeExamStatus(
  startDate: Date,
  endDate: Date,
): "UPCOMING" | "ACTIVE" | "COMPLETED" {
  const now = new Date();
  if (now < startDate) return "UPCOMING";
  if (now > endDate) return "COMPLETED";
  return "ACTIVE";
}

export function toAssessmentDTO(exam: {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  durationMin: number;
}): AssessmentDTO {
  return {
    examId: exam.id,
    title: exam.title,
    startTime: exam.startDate,
    endTime: exam.endDate,
    durationMinutes: exam.durationMin,
    status: computeExamStatus(exam.startDate, exam.endDate),
  };
}

export function canAccessModuleProblem(moduleProblem: {
  isUnlocked: boolean;
  availableFrom: Date | null;
  availableUntil: Date | null;
}): { allowed: boolean; reason?: "LOCKED" | "NOT_YET_AVAILABLE" | "EXPIRED" } {
  const now = new Date();

  if (!moduleProblem.isUnlocked) {
    return { allowed: false, reason: "LOCKED" };
  }

  if (moduleProblem.availableFrom && now < moduleProblem.availableFrom) {
    return { allowed: false, reason: "NOT_YET_AVAILABLE" };
  }

  if (moduleProblem.availableUntil && now > moduleProblem.availableUntil) {
    return { allowed: false, reason: "EXPIRED" };
  }

  return { allowed: true };
}

// ── Read access (creator OR assigned teacher) ──

export async function getTeacherLabOrThrow(userId: string, labId: string) {
  const lab = await labRepository.findTeacherReadableLab(labId, userId);

  if (!lab) {
    throw new NotFoundError("Lab not found");
  }

  if (lab.creatorId !== userId && lab.teachers.length === 0) {
    throw new ForbiddenError("Forbidden");
  }

  return lab;
}

export async function getTeacherModuleOrThrow(
  userId: string,
  moduleId: string,
) {
  const module = await labRepository.findTeacherReadableModule(moduleId, userId);

  if (!module) {
    throw new NotFoundError("Module not found");
  }

  if (module.lab.creatorId !== userId && module.lab.teachers.length === 0) {
    throw new ForbiddenError("Forbidden");
  }

  return module;
}

export async function getTeacherModuleProblemOrThrow(
  userId: string,
  moduleProblemId: string,
) {
  const moduleProblem = await labRepository.findTeacherReadableModuleProblem(
    moduleProblemId,
    userId,
  );

  if (!moduleProblem) {
    throw new NotFoundError("ModuleProblem not found");
  }

  if (
    moduleProblem.module.lab.creatorId !== userId &&
    moduleProblem.module.lab.teachers.length === 0
  ) {
    throw new ForbiddenError("Forbidden");
  }

  return moduleProblem;
}

// ── Write access (creator only) ──

export async function getTeacherLabForWrite(userId: string, labId: string) {
  const lab = await labRepository.findLabById(labId);

  if (!lab) {
    throw new NotFoundError("Lab not found");
  }

  if (lab.creatorId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  return lab;
}

export async function getTeacherModuleForWrite(
  userId: string,
  moduleId: string,
) {
  const module = await labRepository.findTeacherWritableModule(moduleId);

  if (!module) {
    throw new NotFoundError("Module not found");
  }

  if (module.lab.creatorId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  return module;
}

export async function getTeacherModuleProblemForWrite(
  userId: string,
  moduleProblemId: string,
) {
  const moduleProblem =
    await labRepository.findTeacherWritableModuleProblem(moduleProblemId);

  if (!moduleProblem) {
    throw new NotFoundError("ModuleProblem not found");
  }

  if (moduleProblem.module.lab.creatorId !== userId) {
    throw new ForbiddenError("Forbidden");
  }

  return moduleProblem;
}

// ── Lab assignments ──

export async function getLabAssignments(labId: string) {
  const assignments = await labRepository.findLabAssignments(labId);

  return assignments.map((assignment) => ({
    groupId: assignment.group.id,
    groupName: assignment.group.name,
  }));
}

// ── Lab teacher management ──

export async function addLabTeacher(
  labId: string,
  teacherUserId: string,
  addedById: string,
) {
  const teacher = await labRepository.findUserRole(teacherUserId);

  if (!teacher || teacher.globalRoleId !== GLOBAL_ROLE_IDS.ORG_TEACHER) {
    throw new ValidationError("User is not a teacher");
  }

  return labRepository.createLabTeacher(labId, teacherUserId, addedById);
}

export async function removeLabTeacher(
  labId: string,
  teacherUserId: string,
) {
  await labRepository.deleteLabTeacher(labId, teacherUserId);
}

export async function getLabTeachers(labId: string) {
  return labRepository.findLabTeachers(labId);
}

// ── Student access helpers ──

export async function getStudentGroupIds(userId: string): Promise<string[]> {
  return labRepository.findStudentGroupIds(userId);
}

export async function getStudentLabIds(userId: string): Promise<string[]> {
  const groupIds = await getStudentGroupIds(userId);

  if (groupIds.length === 0) return [];

  return labRepository.findLabIdsForGroups(groupIds);
}

// ── Assessments ──

export async function getAssessmentOrThrow(moduleId: string) {
  const module = await labRepository.findAssessmentLink(moduleId);

  if (!module || !module.assessmentExamId) {
    throw new NotFoundError("No assessment linked to this module");
  }

  const exam = await labRepository.findExamSummary(module.assessmentExamId);

  if (!exam) {
    throw new NotFoundError("Linked exam not found");
  }

  return { exam, creatorId: module.lab.creatorId };
}

export async function computeModuleStatus(
  userId: string,
  moduleId: string,
  assessmentExamId: string | null,
): Promise<ModuleStatus> {
  const now = new Date();

  const module = await labRepository.findModuleUnlockAt(moduleId);

  if (module?.unlockAt && module.unlockAt > now) {
    return "LOCKED";
  }

  const totalProblems = await labRepository.countModuleProblems(moduleId);

  const solvedCount =
    totalProblems > 0
      ? await labRepository.countSolvedModuleProblems(userId, moduleId)
      : 0;

  const allProblemsSolved =
    totalProblems === 0 || solvedCount === totalProblems;

  if (assessmentExamId) {
    const attempt = await labRepository.findExamAttemptStatus(
      assessmentExamId,
      userId,
    );
    const attempted = attempt && attempt.status !== "NOT_STARTED";

    if (allProblemsSolved && attempted) return "COMPLETED";
  } else if (allProblemsSolved) {
    return "COMPLETED";
  }

  if (solvedCount > 0) return "IN_PROGRESS";

  return "NOT_STARTED";
}

export async function getModuleProblemProgress(
  userId: string,
  moduleId: string,
) {
  return labRepository.findModuleProblemProgressForStudent(userId, moduleId);
}

export async function getModuleProblemAnalytics(
  moduleId: string,
  groupId?: string,
): Promise<ProblemAnalyticsEntry[]> {
  let userIds: string[] | undefined;

  if (groupId) {
    userIds = await labRepository.findGroupMemberUserIds(groupId);
  }

  const moduleProblems =
    await labRepository.findModuleProblemsWithAllProgress(moduleId);

  return moduleProblems.map((moduleProblem) => {
    const filteredProgress = userIds
      ? moduleProblem.progress.filter((progress) =>
          userIds.includes(progress.userId),
        )
      : moduleProblem.progress;

    const uniqueStudents = new Set(
      filteredProgress.map((progress) => progress.userId),
    );
    const solvedStudents = new Set(
      filteredProgress
        .filter((progress) => progress.isSolved)
        .map((progress) => progress.userId),
    );
    const totalAttempts = filteredProgress.reduce(
      (sum, progress) => sum + progress.attemptCount,
      0,
    );
    const attemptedCount = uniqueStudents.size;

    return {
      problemId: moduleProblem.problem.id,
      problemNumber: moduleProblem.problem.number,
      problemTitle: moduleProblem.problem.title,
      attemptedStudents: attemptedCount,
      solvedStudents: solvedStudents.size,
      solveRate:
        attemptedCount > 0
          ? Math.round((solvedStudents.size / attemptedCount) * 100)
          : 0,
      averageAttempts:
        attemptedCount > 0
          ? Math.round((totalAttempts / attemptedCount) * 10) / 10
          : 0,
    };
  });
}

export async function getModuleStudentProgress(
  moduleId: string,
  groupId?: string,
  take = 20,
  skip = 0,
  search = "",
  sortBy: StudentProgressSortBy = "name",
  sortOrder: SortOrder = "asc",
): Promise<StudentProgressListResponse> {
  const safeTake = Math.max(0, take);
  const safeSkip = Math.max(0, skip);
  const query = search.trim();

  const module = await labRepository.findModuleWithProblemIds(moduleId);

  if (!module) {
    return {
      data: [],
      pagination: { take: safeTake, skip: safeSkip, total: 0, pages: 0 },
    };
  }

  const moduleProblemIds = module.problems.map((problem) => problem.id);
  const totalProblems = moduleProblemIds.length;

  if (totalProblems === 0) {
    return {
      data: [],
      pagination: { take: safeTake, skip: safeSkip, total: 0, pages: 0 },
    };
  }

  let students: { id: string; name: string }[];

  if (groupId) {
    students = await labRepository.findGroupMembersWithUser(groupId);
  } else {
    students = await labRepository.findLabAssignmentsWithMembers(module.labId);
  }

  if (query) {
    const lowerQuery = query.toLowerCase();
    students = students.filter((student) =>
      student.name.toLowerCase().includes(lowerQuery),
    );
  }

  const total = students.length;

  if (total === 0 || safeTake === 0) {
    return {
      data: [],
      pagination: {
        take: safeTake,
        skip: safeSkip,
        total,
        pages: safeTake > 0 ? Math.ceil(total / safeTake) : 0,
      },
    };
  }

  const needsGlobalSort =
    sortBy === "solvedProblems" || sortBy === "completionPercentage";

  if (sortBy === "name") {
    students.sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }

  const studentsForCounting = needsGlobalSort
    ? students
    : students.slice(safeSkip, safeSkip + safeTake);

  const studentIds = studentsForCounting.map((student) => student.id);

  const solvedCounts = await labRepository.groupSolvedProblemsByStudent(
    studentIds,
    moduleProblemIds,
  );

  const solvedMap = new Map<string, number>();

  for (const result of solvedCounts) {
    solvedMap.set(result.userId, result._count._all);
  }

  if (needsGlobalSort) {
    students.sort((a, b) => {
      const aSolved = solvedMap.get(a.id) ?? 0;
      const bSolved = solvedMap.get(b.id) ?? 0;

      let comparison = aSolved - bSolved;

      if (sortOrder === "desc") {
        comparison = -comparison;
      }

      if (comparison === 0) {
        comparison = a.name.localeCompare(b.name);
      }

      return comparison;
    });
  }

  const pageStudents = students.slice(safeSkip, safeSkip + safeTake);

  const data = pageStudents.map((student) => {
    const solved = solvedMap.get(student.id) ?? 0;

    return {
      studentId: student.id,
      studentName: student.name,
      solvedProblems: solved,
      totalProblems,
      completionPercentage:
        totalProblems > 0 ? Math.round((solved / totalProblems) * 100) : 0,
    };
  });

  return {
    data,
    pagination: {
      take: safeTake,
      skip: safeSkip,
      total,
      pages: safeTake > 0 ? Math.ceil(total / safeTake) : 0,
    },
  };
}

async function ensureStudentInModule(studentId: string, moduleId: string) {
  const [hasProgress, lab] = await Promise.all([
    labRepository.findModuleProblemProgressFirst(studentId, moduleId),
    labRepository.findModuleWithLabAssignments(moduleId),
  ]);

  if (hasProgress) return;

  const groupIds = lab?.lab.assignments.map((assignment) => assignment.groupId) ?? [];
  const member = await labRepository.findGroupMembershipForStudent(
    studentId,
    groupIds,
  );

  if (member) return;

  throw new NotFoundError("Student is not part of this module");
}

export async function getStudentModuleAttempts(
  studentId: string,
  moduleId: string,
): Promise<StudentModuleAttemptsResponse> {
  await ensureStudentInModule(studentId, moduleId);

  const moduleProblems =
    await labRepository.findModuleProblemsForAttempts(moduleId);

  const moduleProblemIds = moduleProblems.map((moduleProblem) => moduleProblem.id);
  const progressRows = await labRepository.findModuleProgressRows(
    studentId,
    moduleProblemIds,
  );

  const progressByModuleProblem = new Map<
    string,
    (typeof progressRows)[number]
  >();
  for (const row of progressRows) {
    progressByModuleProblem.set(row.moduleProblemId, row);
  }

  const submissionIds = Array.from(
    new Set(
      progressRows.flatMap((row) =>
        [row.bestSubmissionId, row.latestSubmissionId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  );

  const submissions = await labRepository.findSubmissionsByIds(submissionIds);
  const submissionById = new Map<string, (typeof submissions)[number]>();
  for (const submission of submissions) {
    submissionById.set(submission.id, submission);
  }

  const toSubmissionDetail = (
    submission: (typeof submissions)[number] | null | undefined,
  ) =>
    submission
      ? {
          id: submission.id,
          status: submission.status,
          passedTestcases: submission.passedTestcases,
          totalTestcases: submission.totalTestcases,
          language: submission.language,
          executionTime: submission.executionTime,
          memory: submission.memory,
          createdAt: submission.createdAt,
          sourceCode: submission.sourceCode,
          stderr: submission.stderr,
        }
      : null;

  const problems = moduleProblems.map((moduleProblem) => {
    const row = progressByModuleProblem.get(moduleProblem.id);

    return {
      moduleProblemId: moduleProblem.id,
      problemId: moduleProblem.problem.id,
      problemNumber: moduleProblem.problem.number,
      problemTitle: moduleProblem.problem.title,
      difficulty: moduleProblem.problem.difficulty,
      attemptCount: row?.attemptCount ?? 0,
      isSolved: row?.isSolved ?? false,
      solvedAt: row?.solvedAt ?? null,
      lastAttemptAt: row?.lastAttemptAt ?? null,
      latestSubmissionId: row?.latestSubmissionId ?? null,
      bestSubmissionId: row?.bestSubmissionId ?? null,
      bestSubmission: toSubmissionDetail(
        row?.bestSubmissionId
          ? submissionById.get(row.bestSubmissionId)
          : null,
      ),
      latestSubmission: toSubmissionDetail(
        row?.latestSubmissionId
          ? submissionById.get(row.latestSubmissionId)
          : null,
      ),
    };
  });

  const student = await labRepository.findStudentName(studentId);

  return {
    studentId,
    studentName: student?.name ?? "Unknown",
    totalProblems: moduleProblems.length,
    solvedProblems: problems.filter((problem) => problem.isSolved).length,
    problems,
  };
}

export async function getStudentProblemSubmissions(
  studentId: string,
  moduleId: string,
  moduleProblemId: string,
): Promise<StudentProblemSubmissionsResponse> {
  await ensureStudentInModule(studentId, moduleId);

  const moduleProblem = await labRepository.findModuleProblemInModule(
    moduleProblemId,
    moduleId,
  );

  if (!moduleProblem || moduleProblem.module.id !== moduleId) {
    throw new NotFoundError("Problem not found in this module");
  }

  const submissions =
    await labRepository.findStudentSubmissionsForProblem(
      studentId,
      moduleProblem.problem.id,
    );

  return {
    problemId: moduleProblem.problem.id,
    problemNumber: moduleProblem.problem.number,
    problemTitle: moduleProblem.problem.title,
    total: submissions.length,
    submissions: submissions.map((submission) => ({
      id: submission.id,
      status: submission.status,
      passedTestcases: submission.passedTestcases,
      totalTestcases: submission.totalTestcases,
      language: submission.language,
      executionTime: submission.executionTime,
      memory: submission.memory,
      createdAt: submission.createdAt,
      sourceCode: submission.sourceCode,
      stderr: submission.stderr,
    })),
  };
}

export async function getAssessmentResults(
  moduleId: string,
  groupId?: string,
): Promise<AssessmentResultsDTO> {
  const module = await labRepository.findModuleBrief(moduleId);

  if (!module?.assessmentExamId) {
    throw new NotFoundError("No assessment linked to this module");
  }

  let userIds: string[] | undefined;

  if (groupId) {
    userIds = await labRepository.findGroupMemberUserIds(groupId);
  }

  const attempts = await labRepository.findExamAttemptsForAssessment(
    module.assessmentExamId,
    userIds,
  );

  const totalStudents = attempts.length;
  const attemptedStudents = attempts.filter(
    (attempt) => attempt.status !== "NOT_STARTED",
  ).length;
  const scores = attempts
    .filter((attempt) => attempt.status !== "NOT_STARTED")
    .map((attempt) => attempt.totalScore);

  return {
    totalStudents,
    attemptedStudents,
    averageScore:
      scores.length > 0
        ? Math.round(
            (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10,
          ) / 10
        : 0,
    highestScore: scores.length > 0 ? Math.max(...scores) : 0,
    lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
  };
}

export async function upsertModuleProblemProgress(
  userId: string,
  submissionId: string,
  status: string,
  moduleProblemId?: string,
) {
  if (!moduleProblemId) return;

  const moduleProblem = await labRepository.findModuleProblemById(
    moduleProblemId,
  );

  if (!moduleProblem) return;

  await labRepository.upsertModuleProblemProgressRecord({
    userId,
    moduleProblemId: moduleProblem.id,
    submissionId,
    isAccepted: status === "ACCEPTED",
  });
}

// ── Teacher lab orchestration ──

export async function createLabForTeacher(
  userId: string,
  input: CreateLabInput,
) {
  return labRepository.createLabRecord({
    title: input.title,
    description: input.description ?? null,
    creatorId: userId,
    aiEnabled: input.aiEnabled,
    aiMaxMessages: input.aiMaxMessages ?? null,
    aiMaxTokens: input.aiMaxTokens ?? null,
    sebEnabled: input.sebEnabled ?? false,
  });
}

export async function listLabsForTeacher(
  userId: string,
  query: ListLabsQuery,
) {
  const { labs, total } = await labRepository.findLabsForTeacher({
    userId,
    scope: query.scope,
    searchValue: query.searchvalue,
    take: query.take,
    skip: query.skip,
  });

  return {
    data: labs.map((lab) => ({
      id: lab.id,
      title: lab.title,
      description: lab.description,
      creatorId: lab.creatorId,
      createdAt: lab.createdAt,
      updatedAt: lab.updatedAt,
      aiEnabled: lab.aiEnabled,
      aiMaxMessages: lab.aiMaxMessages,
      aiMaxTokens: lab.aiMaxTokens,
      sebEnabled: lab.sebEnabled,
      modulesCount: lab._count.modules,
      assignedGroupsCount: lab._count.assignments,
      visibility: lab.visibility,
      duplicateCount: lab.duplicateCount,
      originalLabId: lab.originalLabId,
      isArchived: lab.isArchived,
      publishedAt: lab.publishedAt,
    })),
    pagination: {
      take: query.take,
      skip: query.skip,
      total,
      pages: Math.ceil(total / query.take),
    },
  };
}

export async function getLabForTeacher(userId: string, labId: string) {
  const lab = await getTeacherLabOrThrow(userId, labId);
  const modulesCount = await labRepository.countModulesForLab(lab.id);

  return { ...lab, modulesCount };
}

export async function updateLabForTeacher(
  userId: string,
  labId: string,
  input: UpdateLabInput,
) {
  await getTeacherLabForWrite(userId, labId);

  const data: Prisma.LabUpdateInput = { ...input };

  // If aiEnabled is explicitly false, clear quota fields.
  if (input.aiEnabled === false) {
    data.aiMaxMessages = null;
    data.aiMaxTokens = null;
  }

  return labRepository.updateLabRecord(labId, data);
}

export async function deleteLabForTeacher(userId: string, labId: string) {
  await getTeacherLabForWrite(userId, labId);

  await labRepository.deleteLabRecord(labId);

  return { success: true, message: "Lab deleted" };
}

export async function getLabAssignmentsForTeacher(
  userId: string,
  labId: string,
) {
  await getTeacherLabOrThrow(userId, labId);
  return getLabAssignments(labId);
}

export async function assignLabToGroup(
  userId: string,
  labId: string,
  groupId: string,
) {
  await getTeacherLabForWrite(userId, labId);

  const group = await labRepository.findGroupSummary(groupId);

  if (!group) {
    throw new ValidationError("Group not found");
  }

  await labRepository.replaceLabAssignment(labId, group.id);

  return {
    labId,
    assignedGroup: { groupId: group.id, groupName: group.name },
  };
}

export async function unassignLabFromGroup(userId: string, labId: string) {
  await getTeacherLabForWrite(userId, labId);

  await labRepository.deleteLabAssignments(labId);

  return { success: true, message: "Lab unassigned" };
}

export async function createModuleForTeacher(
  userId: string,
  labId: string,
  input: CreateModuleInput,
) {
  await getTeacherLabForWrite(userId, labId);

  const existing = await labRepository.findModuleByLabAndWeek(
    labId,
    input.weekNumber,
  );

  if (existing) {
    throw new ConflictError("Week number already exists for this lab");
  }

  return labRepository.createLabModule({
    labId,
    title: input.title,
    description: input.description ?? null,
    weekNumber: input.weekNumber,
    orderIndex: input.orderIndex ?? null,
    unlockAt: input.unlockAt ? new Date(input.unlockAt) : null,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    assessmentExamId: input.assessmentExamId ?? null,
  });
}

export async function listModulesForTeacher(userId: string, labId: string) {
  await getTeacherLabOrThrow(userId, labId);

  const modules = await labRepository.findModulesForLab(labId);

  return modules.map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    labId: module.labId,
    weekNumber: module.weekNumber,
    orderIndex: module.orderIndex,
    unlockAt: module.unlockAt,
    dueAt: module.dueAt,
    assessmentExamId: module.assessmentExamId,
    createdAt: module.createdAt,
    updatedAt: module.updatedAt,
    problemsCount: module._count.problems,
  }));
}

export async function getModuleForTeacher(userId: string, moduleId: string) {
  const module = await getTeacherModuleOrThrow(userId, moduleId);
  const problemsCount = await labRepository.countModuleProblems(module.id);

  return {
    id: module.id,
    title: module.title,
    description: module.description,
    labId: module.labId,
    labCreatorId: module.lab.creatorId,
    weekNumber: module.weekNumber,
    orderIndex: module.orderIndex,
    unlockAt: module.unlockAt,
    dueAt: module.dueAt,
    assessmentExamId: module.assessmentExamId,
    createdAt: module.createdAt,
    updatedAt: module.updatedAt,
    problemsCount,
  };
}

export async function updateModuleForTeacher(
  userId: string,
  moduleId: string,
  input: UpdateModuleInput,
) {
  const module = await getTeacherModuleForWrite(userId, moduleId);

  if (
    input.weekNumber !== undefined &&
    input.weekNumber !== module.weekNumber
  ) {
    const existing = await labRepository.findModuleByLabAndWeek(
      module.labId,
      input.weekNumber,
    );

    if (existing) {
      throw new ConflictError("Week number already exists for this lab");
    }
  }

  const data: Prisma.LabModuleUpdateInput = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && {
      description: input.description,
    }),
    ...(input.weekNumber !== undefined && { weekNumber: input.weekNumber }),
    ...(input.orderIndex !== undefined && { orderIndex: input.orderIndex }),
    ...(input.unlockAt !== undefined && {
      unlockAt: input.unlockAt ? new Date(input.unlockAt) : null,
    }),
    ...(input.dueAt !== undefined && {
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    }),
    ...(input.assessmentExamId !== undefined && {
      assessmentExamId: input.assessmentExamId,
    }),
  };

  return labRepository.updateLabModule(moduleId, data);
}

export async function deleteModuleForTeacher(userId: string, moduleId: string) {
  await getTeacherModuleForWrite(userId, moduleId);

  await labRepository.deleteLabModule(moduleId);

  return { success: true, message: "Module deleted" };
}

export async function addProblemsToModule(
  userId: string,
  moduleId: string,
  input: AddModuleProblemsInput,
) {
  await getTeacherModuleForWrite(userId, moduleId);

  const existingProblems = await labRepository.findProblemsForModuleAdd(
    input.problemIds,
  );

  if (existingProblems.length !== input.problemIds.length) {
    throw new ValidationError("One or more problems not found");
  }

  const invalidIds = input.problemIds.filter((problemId) => {
    const problem = existingProblems.find((entry) => entry.id === problemId);

    if (!problem) return true;

    return !(
      (problem.visibility === "PUBLIC" &&
        problem.approvalStatus === "APPROVED") ||
      problem.ownerId === userId
    );
  });

  if (invalidIds.length > 0) {
    throw new ForbiddenError(
      `Access denied to problems: ${invalidIds.join(", ")}`,
    );
  }

  const result = await labRepository.createModuleProblems(
    input.problemIds.map((problemId, index) => ({
      moduleId,
      problemId,
      orderIndex: index,
    })),
  );

  return {
    moduleId,
    addedCount: result.count,
  };
}

export async function listModuleProblemsForTeacher(
  userId: string,
  moduleId: string,
) {
  await getTeacherModuleOrThrow(userId, moduleId);

  const problems = await labRepository.findModuleProblemsWithProblem(moduleId);

  return problems.map((moduleProblem) => ({
    id: moduleProblem.id,
    moduleId: moduleProblem.moduleId,
    problemId: moduleProblem.problemId,
    orderIndex: moduleProblem.orderIndex,
    problem: moduleProblem.problem,
    isUnlocked: moduleProblem.isUnlocked,
    availableFrom: moduleProblem.availableFrom,
    availableUntil: moduleProblem.availableUntil,
  }));
}

export async function updateModuleProblemAccessForTeacher(
  userId: string,
  moduleProblemId: string,
  input: UpdateModuleProblemAccessInput,
) {
  await getTeacherModuleProblemForWrite(userId, moduleProblemId);

  const data: Prisma.ModuleProblemUpdateInput = {};

  if (input.isUnlocked !== undefined) {
    data.isUnlocked = input.isUnlocked;
  }

  if (input.availableFrom !== undefined) {
    data.availableFrom = input.availableFrom
      ? new Date(input.availableFrom)
      : null;
  }

  if (input.availableUntil !== undefined) {
    data.availableUntil = input.availableUntil
      ? new Date(input.availableUntil)
      : null;
  }

  await labRepository.updateModuleProblemRecord(moduleProblemId, data);

  return { success: true };
}

export async function getModuleProblemAccessForTeacher(
  userId: string,
  moduleProblemId: string,
) {
  const moduleProblem = await getTeacherModuleProblemOrThrow(
    userId,
    moduleProblemId,
  );

  return {
    isUnlocked: moduleProblem.isUnlocked ?? false,
    availableFrom: moduleProblem.availableFrom ?? null,
    availableUntil: moduleProblem.availableUntil ?? null,
  };
}

export async function removeModuleProblemForTeacher(
  userId: string,
  moduleProblemId: string,
) {
  await getTeacherModuleProblemForWrite(userId, moduleProblemId);

  await labRepository.deleteModuleProblemRecord(moduleProblemId);

  return { success: true, message: "Problem removed from module" };
}

async function assertExamOwnership(userId: string, examId: string) {
  const exam = await labRepository.findExamWithCreator(examId);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  if (exam.creatorId !== userId) {
    throw new ForbiddenError("You don't own this exam");
  }

  return exam;
}

export async function assignModuleAssessment(
  userId: string,
  moduleId: string,
  input: AssignAssessmentInput,
) {
  await getTeacherModuleForWrite(userId, moduleId);

  const exam = await assertExamOwnership(userId, input.examId);

  await labRepository.setModuleAssessmentExam(moduleId, exam.id);

  return {
    moduleId,
    assessmentExamId: exam.id,
  };
}

export async function updateModuleAssessment(
  userId: string,
  moduleId: string,
  input: AssignAssessmentInput,
) {
  const module = await getTeacherModuleForWrite(userId, moduleId);

  if (!module.assessmentExamId) {
    throw new ValidationError("No assessment to update. Use assign first.");
  }

  const exam = await assertExamOwnership(userId, input.examId);

  await labRepository.setModuleAssessmentExam(moduleId, exam.id);

  return {
    moduleId,
    assessmentExamId: exam.id,
  };
}

export async function removeModuleAssessment(
  userId: string,
  moduleId: string,
) {
  await getTeacherModuleForWrite(userId, moduleId);

  await labRepository.setModuleAssessmentExam(moduleId, null);

  return { success: true, message: "Assessment removed from module" };
}

export async function createModuleAssessment(
  userId: string,
  moduleId: string,
  input: CreateAssessmentInput,
) {
  const module = await getTeacherModuleForWrite(userId, moduleId);

  const now = new Date();

  const result = await labRepository.createAssessmentExamForModule(
    moduleId,
    module.labId,
    {
      title: input.title || `${module.title} - Assessment`,
      description: `Assessment for ${module.title}`,
      creatorId: userId,
      startDate: module.unlockAt || now,
      endDate:
        module.dueAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      durationMin: input.durationMin || 60,
    },
  );

  return {
    moduleId,
    assessmentExamId: result.id,
    exam: result,
  };
}

export async function getModuleAssessmentForTeacher(
  userId: string,
  moduleId: string,
) {
  await getTeacherModuleOrThrow(userId, moduleId);

  const { exam } = await getAssessmentOrThrow(moduleId);

  return toAssessmentDTO(exam);
}

export async function getLabsStats(userId: string) {
  const { totalLabs, labsWithModules, totalGroups, totalStudents } =
    await labRepository.findLabsOverviewStats(userId);

  const totalModules = labsWithModules.reduce(
    (sum, lab) => sum + lab._count.modules,
    0,
  );

  return { totalLabs, totalModules, totalGroups, totalStudents };
}

export async function getModuleProblemAnalyticsForTeacher(
  userId: string,
  moduleId: string,
  groupId?: string,
) {
  await getTeacherModuleOrThrow(userId, moduleId);

  return getModuleProblemAnalytics(moduleId, groupId);
}

export async function getAssessmentResultsForTeacher(
  userId: string,
  moduleId: string,
  groupId?: string,
) {
  await getTeacherModuleOrThrow(userId, moduleId);

  return getAssessmentResults(moduleId, groupId);
}

export async function getModuleStudentProgressForTeacher(
  userId: string,
  moduleId: string,
  query: StudentProgressQuery,
) {
  await getTeacherModuleOrThrow(userId, moduleId);

  return getModuleStudentProgress(
    moduleId,
    query.groupId,
    query.take,
    query.skip,
    query.search,
    query.sortBy,
    query.sortOrder,
  );
}

export async function getModuleStudentAttemptsForTeacher(
  userId: string,
  moduleId: string,
  studentId: string,
) {
  await getTeacherModuleOrThrow(userId, moduleId);

  return getStudentModuleAttempts(studentId, moduleId);
}

export async function getModuleStudentProblemSubmissionsForTeacher(
  userId: string,
  moduleId: string,
  studentId: string,
  moduleProblemId: string,
) {
  await getTeacherModuleOrThrow(userId, moduleId);

  return getStudentProblemSubmissions(studentId, moduleId, moduleProblemId);
}

// ── Lab teacher orchestration ──

export async function searchTeachers(q?: string) {
  if (!q || q.length < 2) {
    return [];
  }

  return labRepository.searchTeachersByRole(q, GLOBAL_ROLE_IDS.ORG_TEACHER);
}

export async function addTeacherToLab(
  userId: string,
  labId: string,
  input: AddLabTeacherInput,
) {
  await getTeacherLabForWrite(userId, labId);

  if (!input.email && !input.userId) {
    throw new ValidationError("email or userId is required");
  }

  const teacher = await labRepository.findUserForTeacher({
    email: input.email,
    userId: input.userId,
  });

  if (!teacher) {
    throw new NotFoundError("Teacher not found");
  }

  if (teacher.globalRoleId !== GLOBAL_ROLE_IDS.ORG_TEACHER) {
    throw new ValidationError("User is not a teacher");
  }

  await addLabTeacher(labId, teacher.id, userId);

  return {
    success: true,
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
  };
}

export async function removeTeacherFromLab(
  userId: string,
  labId: string,
  teacherUserId: string,
) {
  await getTeacherLabForWrite(userId, labId);

  if (teacherUserId === userId) {
    throw new ValidationError("Cannot remove yourself");
  }

  await removeLabTeacher(labId, teacherUserId);

  return { success: true, message: "Teacher removed from lab" };
}

export async function listLabTeachersForTeacher(
  userId: string,
  labId: string,
) {
  await getTeacherLabOrThrow(userId, labId);

  return getLabTeachers(labId);
}

// ── Marketplace-backed lab actions ──

export async function publishLabForTeacher(userId: string, labId: string) {
  return marketplaceService.publishLab(userId, labId);
}

export async function unpublishLabForTeacher(userId: string, labId: string) {
  return marketplaceService.unpublishLab(userId, labId);
}

export async function getLabAnalyticsForTeacher(userId: string, labId: string) {
  return marketplaceService.getLabAnalytics(userId, labId);
}

// ── Student lab reads ──

interface StudentModuleSource {
  id: string;
  title: string;
  description: string | null;
  weekNumber: number;
  orderIndex: number | null;
  unlockAt: Date | null;
  dueAt: Date | null;
  assessmentExamId: string | null;
  _count: { problems: number };
}

async function buildStudentModuleSummary(
  userId: string,
  module: StudentModuleSource,
) {
  const [completedProblems, totalProblems, moduleStatus, progress] =
    await Promise.all([
      labRepository.countSolvedModuleProblems(userId, module.id),
      labRepository.countModuleProblems(module.id),
      computeModuleStatus(userId, module.id, module.assessmentExamId),
      getModuleProblemProgress(userId, module.id),
    ]);

  let assessment = null;

  if (module.assessmentExamId) {
    try {
      const { exam } = await getAssessmentOrThrow(module.id);
      assessment = toAssessmentDTO(exam);
    } catch {
      // Linked exam missing, skip.
    }
  }

  return {
    id: module.id,
    title: module.title,
    description: module.description,
    weekNumber: module.weekNumber,
    orderIndex: module.orderIndex,
    unlockAt: module.unlockAt,
    dueAt: module.dueAt,
    problemsCount: module._count.problems,
    completedProblems,
    totalProblems,
    completionPercentage:
      totalProblems > 0
        ? Math.round((completedProblems / totalProblems) * 100)
        : 0,
    moduleStatus,
    progress,
    assessment,
  };
}

function isModuleUnlocked(module: { unlockAt: Date | null }) {
  return !module.unlockAt || module.unlockAt <= new Date();
}

async function assertStudentLabAccess(
  userId: string,
  labId: string,
  message: string,
) {
  const labIds = await getStudentLabIds(userId);

  if (!labIds.includes(labId)) {
    throw new NotFoundError(message);
  }
}

export async function getStudentMyLabs(userId: string) {
  const labIds = await getStudentLabIds(userId);

  if (labIds.length === 0) {
    return [];
  }

  const labs = await labRepository.findLabsWithModulesForStudent(labIds);

  return Promise.all(
    labs.map(async (lab) => {
      const visibleModules = await Promise.all(
        lab.modules
          .filter(isModuleUnlocked)
          .map((module) => buildStudentModuleSummary(userId, module)),
      );

      return {
        id: lab.id,
        title: lab.title,
        description: lab.description,
        creatorName: lab.creator.name,
        sebEnabled: lab.sebEnabled,
        modulesCount: visibleModules.length,
        modules: visibleModules,
      };
    }),
  );
}

export async function getStudentMyLab(userId: string, labId: string) {
  await assertStudentLabAccess(userId, labId, "Lab not found");

  const lab = await labRepository.findLabWithModulesForStudent(labId);

  if (!lab) {
    throw new NotFoundError("Lab not found");
  }

  const visibleModules = await Promise.all(
    lab.modules
      .filter(isModuleUnlocked)
      .map((module) => buildStudentModuleSummary(userId, module)),
  );

  return {
    id: lab.id,
    title: lab.title,
    description: lab.description,
    sebEnabled: lab.sebEnabled,
    modulesCount: visibleModules.length,
    modules: visibleModules,
  };
}

export async function getStudentModuleProblems(
  userId: string,
  moduleId: string,
  sebContext: SebRequestContext,
) {
  const labIds = await getStudentLabIds(userId);

  const module = await labRepository.findModuleForStudent(moduleId);

  if (!module || !labIds.includes(module.labId)) {
    throw new NotFoundError("Module not found");
  }

  if (module.unlockAt && module.unlockAt > new Date()) {
    throw new ForbiddenError("Module is locked");
  }

  const lab = await labRepository.findLabSebFlag(module.labId);

  if (lab?.sebEnabled) {
    verifySEB(sebContext);
  }

  const problems = await labRepository.findModuleProblemsWithStudentProgress(
    moduleId,
    userId,
  );

  const totalProblems = problems.length;
  const completedProblems = problems.filter(
    (problem) => problem.progress.length > 0 && problem.progress[0].isSolved,
  ).length;

  let assessment = null;

  if (module.assessmentExamId) {
    try {
      const { exam } = await getAssessmentOrThrow(moduleId);
      assessment = toAssessmentDTO(exam);
    } catch {
      // Linked exam missing, skip.
    }
  }

  return {
    module: {
      id: module.id,
      title: module.title,
      description: module.description,
      weekNumber: module.weekNumber,
      orderIndex: module.orderIndex,
      unlockAt: module.unlockAt,
      dueAt: module.dueAt,
      assessmentExamId: module.assessmentExamId,
      sebEnabled: lab?.sebEnabled ?? false,
    },
    completedProblems,
    totalProblems,
    completionPercentage:
      totalProblems > 0
        ? Math.round((completedProblems / totalProblems) * 100)
        : 0,
    assessment,
    problems: problems.map((moduleProblem) => {
      const access = canAccessModuleProblem({
        isUnlocked: moduleProblem.isUnlocked ?? false,
        availableFrom: moduleProblem.availableFrom ?? null,
        availableUntil: moduleProblem.availableUntil ?? null,
      });

      return {
        id: moduleProblem.id,
        moduleId: moduleProblem.moduleId,
        problemId: moduleProblem.problemId,
        orderIndex: moduleProblem.orderIndex,
        problem: moduleProblem.problem,
        progress: moduleProblem.progress[0] || null,
        isUnlocked: moduleProblem.isUnlocked ?? false,
        availableFrom: moduleProblem.availableFrom ?? null,
        availableUntil: moduleProblem.availableUntil ?? null,
        accessStatus: access.allowed ? "AVAILABLE" : access.reason,
      };
    }),
  };
}

export async function getStudentModuleProgress(userId: string, moduleId: string) {
  const labIds = await getStudentLabIds(userId);

  const module = await labRepository.findModuleBrief(moduleId);

  if (!module || !labIds.includes(module.labId)) {
    throw new NotFoundError("Module not found");
  }

  const progress = await getModuleProblemProgress(userId, moduleId);

  return { problems: progress };
}

export async function getStudentModuleAssessment(
  userId: string,
  moduleId: string,
) {
  const labIds = await getStudentLabIds(userId);

  const module = await labRepository.findModuleBrief(moduleId);

  if (!module || !labIds.includes(module.labId)) {
    throw new NotFoundError("Module not found");
  }

  const { exam } = await getAssessmentOrThrow(moduleId);

  return toAssessmentDTO(exam);
}

export async function getStudentModuleProblem(
  userId: string,
  moduleProblemId: string,
) {
  const labIds = await getStudentLabIds(userId);

  const moduleProblem = await labRepository.findModuleProblemWithModule(
    moduleProblemId,
  );

  if (!moduleProblem) {
    throw new NotFoundError("ModuleProblem not found");
  }

  if (!labIds.includes(moduleProblem.module.lab.id)) {
    throw new ForbiddenError("Forbidden");
  }

  if (
    moduleProblem.module.unlockAt &&
    moduleProblem.module.unlockAt > new Date()
  ) {
    throw new ForbiddenError("Module is locked");
  }

  const progress = await labRepository.findModuleProblemProgressUnique(
    userId,
    moduleProblemId,
  );

  const allModuleProblems = await labRepository.findModuleProblemsBrief(
    moduleProblem.moduleId,
  );

  const currentIndex = allModuleProblems.findIndex(
    (entry) => entry.id === moduleProblemId,
  );

  const previousProblem =
    currentIndex > 0 ? allModuleProblems[currentIndex - 1] : null;
  const nextProblem =
    currentIndex < allModuleProblems.length - 1
      ? allModuleProblems[currentIndex + 1]
      : null;

  const accessResult = canAccessModuleProblem({
    isUnlocked: moduleProblem.isUnlocked ?? false,
    availableFrom: moduleProblem.availableFrom ?? null,
    availableUntil: moduleProblem.availableUntil ?? null,
  });

  return {
    moduleProblem: {
      id: moduleProblem.id,
      moduleId: moduleProblem.moduleId,
      problemId: moduleProblem.problemId,
      orderIndex: moduleProblem.orderIndex,
      isUnlocked: moduleProblem.isUnlocked ?? false,
      availableFrom: moduleProblem.availableFrom ?? null,
      availableUntil: moduleProblem.availableUntil ?? null,
      accessStatus: accessResult.allowed ? "AVAILABLE" : accessResult.reason,
    },
    module: {
      id: moduleProblem.module.id,
      title: moduleProblem.module.title,
      description: moduleProblem.module.description,
      weekNumber: moduleProblem.module.weekNumber,
      orderIndex: moduleProblem.module.orderIndex,
      unlockAt: moduleProblem.module.unlockAt,
      dueAt: moduleProblem.module.dueAt,
      assessmentExamId: moduleProblem.module.assessmentExamId,
    },
    lab: {
      id: moduleProblem.module.lab.id,
      title: moduleProblem.module.lab.title,
      description: moduleProblem.module.lab.description,
    },
    progress: progress
      ? {
          attemptCount: progress.attemptCount,
          isSolved: progress.isSolved,
          solvedAt: progress.solvedAt,
          lastAttemptAt: progress.lastAttemptAt,
        }
      : null,
    previousProblem,
    nextProblem,
  };
}
