import prisma from "@/utils/prisma";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
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

export async function getLabAssignments(labId: string) {
  const assignments = await prisma.labAssignment.findMany({
    where: { labId },
    include: { group: { select: { id: true, name: true } } },
  });
  return assignments.map((a: any) => ({
    groupId: a.group.id,
    groupName: a.group.name,
  }));
}

// ── Read access (creator OR assigned teacher) ──

export async function getTeacherLabOrThrow(userId: string, labId: string) {
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    include: {
      teachers: {
        where: { userId },
        select: { id: true },
      },
    },
  });
  if (!lab) {
    const err = new Error("Lab not found");
    (err as any).status = 404;
    throw err;
  }
  if (lab.creatorId !== userId && lab.teachers.length === 0) {
    const err = new Error("Forbidden");
    (err as any).status = 403;
    throw err;
  }
  return lab;
}

export async function getTeacherModuleOrThrow(
  userId: string,
  moduleId: string,
) {
  const module = await prisma.labModule.findUnique({
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
  if (!module) {
    const err = new Error("Module not found");
    (err as any).status = 404;
    throw err;
  }
  if (module.lab.creatorId !== userId && module.lab.teachers.length === 0) {
    const err = new Error("Forbidden");
    (err as any).status = 403;
    throw err;
  }
  return module;
}

export async function getTeacherModuleProblemOrThrow(
  userId: string,
  moduleProblemId: string,
) {
  const mp = await prisma.moduleProblem.findUnique({
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
  if (!mp) {
    const err = new Error("ModuleProblem not found");
    (err as any).status = 404;
    throw err;
  }
  if (mp.module.lab.creatorId !== userId && mp.module.lab.teachers.length === 0) {
    const err = new Error("Forbidden");
    (err as any).status = 403;
    throw err;
  }
  return mp;
}

// ── Write access (creator only) ──

export async function getTeacherLabForWrite(userId: string, labId: string) {
  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) {
    const err = new Error("Lab not found");
    (err as any).status = 404;
    throw err;
  }
  if (lab.creatorId !== userId) {
    const err = new Error("Forbidden");
    (err as any).status = 403;
    throw err;
  }
  return lab;
}

export async function getTeacherModuleForWrite(
  userId: string,
  moduleId: string,
) {
  const module = await prisma.labModule.findUnique({
    where: { id: moduleId },
    include: { lab: { select: { creatorId: true } } },
  });
  if (!module) {
    const err = new Error("Module not found");
    (err as any).status = 404;
    throw err;
  }
  if (module.lab.creatorId !== userId) {
    const err = new Error("Forbidden");
    (err as any).status = 403;
    throw err;
  }
  return module;
}

export async function getTeacherModuleProblemForWrite(
  userId: string,
  moduleProblemId: string,
) {
  const mp = await prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
    include: {
      module: {
        include: { lab: { select: { creatorId: true } } },
      },
    },
  });
  if (!mp) {
    const err = new Error("ModuleProblem not found");
    (err as any).status = 404;
    throw err;
  }
  if (mp.module.lab.creatorId !== userId) {
    const err = new Error("Forbidden");
    (err as any).status = 403;
    throw err;
  }
  return mp;
}

// ── Lab teacher management ──

export async function addLabTeacher(
  labId: string,
  teacherUserId: string,
  addedById: string,
) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherUserId },
    select: { globalRoleId: true },
  });
  if (!teacher || teacher.globalRoleId !== GLOBAL_ROLE_IDS.ORG_TEACHER) {
    const err = new Error("User is not a teacher");
    (err as any).status = 400;
    throw err;
  }

  return prisma.labTeacher.create({
    data: { labId, userId: teacherUserId, addedById },
  });
}

export async function removeLabTeacher(labId: string, teacherUserId: string) {
  await prisma.labTeacher.delete({
    where: { labId_userId: { labId, userId: teacherUserId } },
  });
}

export async function getLabTeachers(labId: string) {
  return prisma.labTeacher.findMany({
    where: { labId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      addedBy: { select: { id: true, name: true } },
    },
    orderBy: { addedAt: "desc" },
  });
}

export async function getStudentGroupIds(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return memberships.map((m: { groupId: string }) => m.groupId);
}

export async function getStudentLabIds(userId: string): Promise<string[]> {
  const groupIds = await getStudentGroupIds(userId);
  if (groupIds.length === 0) return [];
  const assignments = await prisma.labAssignment.findMany({
    where: { groupId: { in: groupIds } },
    select: { labId: true },
  });
  return [
    ...new Set<string>(assignments.map((a: { labId: string }) => a.labId)),
  ];
}

export function computeExamStatus(
  startDate: Date,
  endDate: Date,
): "UPCOMING" | "ACTIVE" | "COMPLETED" {
  const now = new Date();
  if (now < startDate) return "UPCOMING";
  if (now > endDate) return "COMPLETED";
  return "ACTIVE";
}

export async function getAssessmentOrThrow(moduleId: string) {
  const module = await prisma.labModule.findUnique({
    where: { id: moduleId },
    select: { assessmentExamId: true, lab: { select: { creatorId: true } } },
  });
  if (!module || !module.assessmentExamId) {
    const err = new Error("No assessment linked to this module");
    (err as any).status = 404;
    throw err;
  }
  const exam = await prisma.exam.findUnique({
    where: { id: module.assessmentExamId },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      durationMin: true,
    },
  });
  if (!exam) {
    const err = new Error("Linked exam not found");
    (err as any).status = 404;
    throw err;
  }
  return { exam, creatorId: module.lab.creatorId };
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

export async function computeModuleStatus(
  userId: string,
  moduleId: string,
  assessmentExamId: string | null,
): Promise<ModuleStatus> {
  const now = new Date();

  const module = await prisma.labModule.findUnique({
    where: { id: moduleId },
    select: { unlockAt: true },
  });
  if (module?.unlockAt && module.unlockAt > now) {
    return "LOCKED";
  }

  const totalProblems = await prisma.moduleProblem.count({
    where: { moduleId },
  });

  const solvedCount =
    totalProblems > 0
      ? await prisma.moduleProblemProgress.count({
          where: {
            moduleProblem: { moduleId },
            userId,
            isSolved: true,
          },
        })
      : 0;

  const allProblemsSolved =
    totalProblems === 0 || solvedCount === totalProblems;

  if (assessmentExamId) {
    const attempt = await prisma.examAttempt.findUnique({
      where: {
        examId_studentId: { examId: assessmentExamId, studentId: userId },
      },
      select: { status: true },
    });
    const attempted = attempt && attempt.status !== "NOT_STARTED";
    if (allProblemsSolved && attempted) return "COMPLETED";
  } else {
    if (allProblemsSolved) return "COMPLETED";
  }

  if (solvedCount > 0) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export async function getModuleProblemProgress(
  userId: string,
  moduleId: string,
) {
  const progress = await prisma.moduleProblemProgress.findMany({
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
  return progress;
}

export async function getModuleProblemAnalytics(
  moduleId: string,
  groupId?: string,
): Promise<ProblemAnalyticsEntry[]> {
  let userIds: string[] | undefined;
  if (groupId) {
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    userIds = members.map((m: { userId: string }) => m.userId);
  }

  const moduleProblems = await prisma.moduleProblem.findMany({
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

  return moduleProblems.map((mp: any) => {
    const filteredProgress = userIds
      ? mp.progress.filter((p: any) => userIds!.includes(p.userId))
      : mp.progress;
    const uniqueStudents = new Set(filteredProgress.map((p: any) => p.userId));
    const solvedStudents = new Set(
      filteredProgress.filter((p: any) => p.isSolved).map((p: any) => p.userId),
    );
    const totalAttempts = filteredProgress.reduce(
      (sum: number, p: any) => sum + p.attemptCount,
      0,
    );
    const attemptedCount = uniqueStudents.size;

    return {
      problemId: mp.problem.id,
      problemNumber: mp.problem.number,
      problemTitle: mp.problem.title,
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
  const [totalProblems, moduleProblems] = await Promise.all([
    prisma.moduleProblem.count({ where: { moduleId } }),
    prisma.moduleProblem.findMany({
      where: { moduleId },
      select: { problemId: true },
    }),
  ]);
  if (totalProblems === 0) {
    return {
      data: [],
      pagination: { take, skip, total: 0, pages: 0 },
    };
  }
  const problemIds = moduleProblems.map((mp) => mp.problemId);

  // Resolve the student universe (id + name).
  let students: { id: string; name: string }[];
  if (groupId) {
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { user: { select: { id: true, name: true } } },
    });
    students = members
      .map((m: any) => m.user)
      .filter((u: any): u is { id: string; name: string } => !!u?.name);
  } else {
    const [progressUsers, submissionUsers] = await Promise.all([
      prisma.moduleProblemProgress.findMany({
        where: { moduleProblem: { moduleId } },
        distinct: ["userId"],
        select: { user: { select: { id: true, name: true } } },
      }),
      prisma.selfSubmission.findMany({
        where: { problemId: { in: problemIds } },
        distinct: ["userId"],
        select: { user: { select: { id: true, name: true } } },
      }),
    ]);
    const byId = new Map<string, { id: string; name: string }>();
    for (const p of [...progressUsers, ...submissionUsers] as any[]) {
      if (p.user?.name && !byId.has(p.user.id)) {
        byId.set(p.user.id, { id: p.user.id, name: p.user.name });
      }
    }
    students = Array.from(byId.values());
  }

  // Case-insensitive name search.
  const q = search.trim().toLowerCase();
  if (q) {
    students = students.filter((s) => s.name.toLowerCase().includes(q));
  }

  const total = students.length;
  const pages = take > 0 ? Math.ceil(total / take) : 0;

  // Solved counts = distinct ACCEPTED submissions per (user, problem) — a
  // problem is solved for a student when they have an ACCEPTED submission for
  // it, regardless of whether it was made from this module's UI.
  const needsCountsForSort =
    sortBy === "solvedProblems" || sortBy === "completionPercentage";
  const countUserIds = needsCountsForSort
    ? students.map((s) => s.id)
    : students.slice(skip, skip + take).map((s) => s.id);

  const solvedMap = new Map<string, number>();
  if (countUserIds.length > 0) {
    const accepted = await prisma.selfSubmission.findMany({
      where: {
        problemId: { in: problemIds },
        status: "ACCEPTED",
        userId: { in: countUserIds },
      },
      select: { userId: true, problemId: true },
      distinct: ["userId", "problemId"],
    });
    for (const a of accepted) {
      solvedMap.set(a.userId, (solvedMap.get(a.userId) ?? 0) + 1);
    }
  }

  if (sortBy === "name") {
    students.sort((a, b) =>
      sortOrder === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    );
  } else {
    students.sort((a, b) => {
      const aSolved = solvedMap.get(a.id) ?? 0;
      const bSolved = solvedMap.get(b.id) ?? 0;
      const cmp = sortOrder === "asc" ? aSolved - bSolved : bSolved - aSolved;
      return cmp === 0 ? a.name.localeCompare(b.name) : cmp;
    });
  }

  const pageStudents = students.slice(skip, skip + take);

  const data = pageStudents.map((s) => {
    const solved = solvedMap.get(s.id) ?? 0;
    return {
      studentId: s.id,
      studentName: s.name,
      solvedProblems: solved,
      totalProblems,
      completionPercentage: Math.round((solved / totalProblems) * 100),
    };
  });

  return { data, pagination: { take, skip, total, pages } };
}

async function ensureStudentInModule(studentId: string, moduleId: string) {
  const [hasProgress, lab] = await Promise.all([
    prisma.moduleProblemProgress.findFirst({
      where: { userId: studentId, moduleProblem: { moduleId } },
      select: { id: true },
    }),
    prisma.labModule.findUnique({
      where: { id: moduleId },
      select: {
        lab: {
          select: { assignments: { select: { groupId: true } } },
        },
      },
    }),
  ]);

  if (hasProgress) return;

  const groupIds = lab?.lab.assignments.map((a) => a.groupId) ?? [];
  if (groupIds.length > 0) {
    const member = await prisma.groupMember.findFirst({
      where: { userId: studentId, groupId: { in: groupIds } },
      select: { id: true },
    });
    if (member) return;
  }

  const err = new Error("Student is not part of this module");
  (err as any).status = 404;
  throw err;
}

export async function getStudentModuleAttempts(
  studentId: string,
  moduleId: string,
): Promise<StudentModuleAttemptsResponse> {
  await ensureStudentInModule(studentId, moduleId);

  const moduleProblems = await prisma.moduleProblem.findMany({
    where: { moduleId },
    include: {
      problem: {
        select: { id: true, number: true, title: true, difficulty: true },
      },
    },
    orderBy: { orderIndex: "asc" },
  });

  const problemIds = moduleProblems.map((mp) => mp.problem.id);
  const submissions = problemIds.length
    ? await prisma.selfSubmission.findMany({
        where: { userId: studentId, problemId: { in: problemIds } },
        select: {
          id: true,
          problemId: true,
          status: true,
          passedTestcases: true,
          totalTestcases: true,
          language: true,
          executionTime: true,
          memory: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // Terminal submissions grouped per problem. PENDING/RUNNING rows are
  // in-flight and are not counted as completed attempts.
  const byProblem = new Map<string, (typeof submissions)[number][]>();
  for (const s of submissions) {
    if (s.status === "PENDING" || s.status === "RUNNING") continue;
    const arr = byProblem.get(s.problemId) ?? [];
    arr.push(s);
    byProblem.set(s.problemId, arr);
  }

  const problems = moduleProblems.map((mp: any) => {
    const rows = byProblem.get(mp.problem.id) ?? [];
    const accepted = rows.filter((s) => s.status === "ACCEPTED");
    const best =
      accepted.length > 0
        ? accepted.reduce((a, b) =>
            b.passedTestcases > a.passedTestcases ||
            (b.passedTestcases === a.passedTestcases &&
              b.createdAt < a.createdAt)
              ? b
              : a,
          )
        : rows[rows.length - 1];
    return {
      moduleProblemId: mp.id,
      problemId: mp.problem.id,
      problemNumber: mp.problem.number,
      problemTitle: mp.problem.title,
      difficulty: mp.problem.difficulty,
      attemptCount: rows.length,
      isSolved: accepted.length > 0,
      solvedAt: accepted.length > 0 ? accepted[0].createdAt : null,
      lastAttemptAt: rows.length > 0 ? rows[rows.length - 1].createdAt : null,
      bestSubmission: best
        ? {
            id: best.id,
            status: best.status,
            passedTestcases: best.passedTestcases,
            totalTestcases: best.totalTestcases,
            language: best.language,
            executionTime: best.executionTime,
            memory: best.memory,
            createdAt: best.createdAt,
          }
        : null,
    };
  });

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { name: true },
  });

  return {
    studentId,
    studentName: student?.name ?? "Unknown",
    totalProblems: moduleProblems.length,
    solvedProblems: problems.filter((p) => p.isSolved).length,
    problems,
  };
}

export async function getStudentProblemSubmissions(
  studentId: string,
  moduleId: string,
  moduleProblemId: string,
): Promise<StudentProblemSubmissionsResponse> {
  await ensureStudentInModule(studentId, moduleId);

  const mp = await prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
    include: {
      module: { select: { id: true } },
      problem: { select: { id: true, number: true, title: true } },
    },
  });
  if (!mp || mp.module.id !== moduleId) {
    const err = new Error("Problem not found in this module");
    (err as any).status = 404;
    throw err;
  }

  const submissions = await prisma.selfSubmission.findMany({
    where: {
      userId: studentId,
      problemId: mp.problem.id,
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

  return {
    problemId: mp.problem.id,
    problemNumber: mp.problem.number,
    problemTitle: mp.problem.title,
    total: submissions.length,
    submissions: submissions.map((s: any) => ({
      id: s.id,
      status: s.status,
      passedTestcases: s.passedTestcases,
      totalTestcases: s.totalTestcases,
      language: s.language,
      executionTime: s.executionTime,
      memory: s.memory,
      createdAt: s.createdAt,
      sourceCode: s.sourceCode,
      stderr: s.stderr,
    })),
  };
}

export async function getAssessmentResults(
  moduleId: string,
  groupId?: string,
): Promise<AssessmentResultsDTO> {
  const module = await prisma.labModule.findUnique({
    where: { id: moduleId },
    select: { assessmentExamId: true },
  });
  if (!module?.assessmentExamId) {
    const err = new Error("No assessment linked to this module");
    (err as any).status = 404;
    throw err;
  }

  let userIds: string[] | undefined;
  if (groupId) {
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    userIds = members.map((m: { userId: string }) => m.userId);
  }

  const attempts = await prisma.examAttempt.findMany({
    where: {
      examId: module.assessmentExamId,
      ...(userIds ? { studentId: { in: userIds } } : {}),
    },
    select: {
      studentId: true,
      totalScore: true,
      status: true,
    },
  });

  const totalStudents = attempts.length;
  const attemptedStudents = attempts.filter(
    (a: any) => a.status !== "NOT_STARTED",
  ).length;
  const scores = attempts
    .filter((a: any) => a.status !== "NOT_STARTED")
    .map((a: any) => a.totalScore);

  return {
    totalStudents,
    attemptedStudents,
    averageScore:
      scores.length > 0
        ? Math.round(
            (scores.reduce((a: number, b: number) => a + b, 0) /
              scores.length) *
              10,
          ) / 10
        : 0,
    highestScore: scores.length > 0 ? Math.max(...scores) : 0,
    lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
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

export async function upsertModuleProblemProgress(
  userId: string,
  submissionId: string,
  status: string,
  moduleProblemId?: string,
) {
  if (!moduleProblemId) return;

  const moduleProblem = await prisma.moduleProblem.findUnique({
    where: { id: moduleProblemId },
  });
  if (!moduleProblem) return;

  const isAccepted = status === "ACCEPTED";

  await prisma.$transaction(async (tx: any) => {
    const existing = await tx.moduleProblemProgress.findUnique({
      where: {
        userId_moduleProblemId: {
          userId,
          moduleProblemId: moduleProblem.id,
        },
      },
    });

    if (existing?.latestSubmissionId === submissionId) return;

    const updateData: Record<string, any> = {
      attemptCount: { increment: 1 },
      latestSubmissionId: submissionId,
      lastAttemptAt: new Date(),
    };

    if (isAccepted && !existing?.isSolved) {
      updateData.isSolved = true;
      updateData.solvedAt = new Date();
      updateData.bestSubmissionId = submissionId;
    }

    await tx.moduleProblemProgress.upsert({
      where: {
        userId_moduleProblemId: {
          userId,
          moduleProblemId: moduleProblem.id,
        },
      },
      create: {
        userId,
        moduleProblemId: moduleProblem.id,
        attemptCount: 1,
        isSolved: isAccepted,
        solvedAt: isAccepted ? new Date() : null,
        latestSubmissionId: submissionId,
        bestSubmissionId: isAccepted ? submissionId : null,
        lastAttemptAt: new Date(),
      },
      update: updateData,
    });
  });
}
