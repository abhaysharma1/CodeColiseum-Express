import prisma from "@/utils/prisma";
import type {
  AssessmentDTO,
  AssessmentResultsDTO,
  ModuleStatus,
  ProblemAnalyticsEntry,
  StudentProgressEntry,
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

export async function getTeacherLabOrThrow(userId: string, labId: string) {
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

export async function getTeacherModuleOrThrow(
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

export async function getTeacherModuleProblemOrThrow(
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
): Promise<StudentProgressEntry[]> {
  const totalProblems = await prisma.moduleProblem.count({
    where: { moduleId },
  });
  if (totalProblems === 0) return [];

  let userIds: string[] | undefined;
  if (groupId) {
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    userIds = members.map((m: { userId: string }) => m.userId);
  }

  const progress = await prisma.moduleProblemProgress.findMany({
    where: {
      moduleProblem: {
        moduleId,
      },
      ...(userIds ? { userId: { in: userIds } } : {}),
    },
    select: {
      userId: true,
      isSolved: true,
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  
  const studentMap = new Map<string, { name: string; solved: number }>();
  for (const p of progress) {
    if (!studentMap.has(p.userId)) {
      studentMap.set(p.userId, { name: p.user.name, solved: 0 });
    }
    if (p.isSolved) {
      studentMap.get(p.userId)!.solved++;
    }
  }

  return Array.from(studentMap.entries()).map(([studentId, data]) => ({
    studentId,
    studentName: data.name,
    solvedProblems: data.solved,
    totalProblems,
    completionPercentage: Math.round((data.solved / totalProblems) * 100),
  }));
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
