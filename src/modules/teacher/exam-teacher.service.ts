import type { Prisma } from "../../../generated/prisma/client";
import {
  ExamStatus,
  NotificationPriority,
  NotificationType,
} from "../../../generated/prisma/enums";
import { PERMISSIONS } from "@/permissions/permission.constants";
import { GLOBAL_ROLE_IDS, GROUP_ROLE_IDS } from "@/permissions/role.constants";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import { sendBatchToSQS } from "@/utils/sqs";
import * as examRepository from "./exam-teacher.repository";
import * as teacherRepository from "./teacher.repository";
import {
  assertCanAccessExam,
  calculatePassingPercentage,
  canAccessExamWithFallback,
  deriveExamStatus,
  EXAM_PASSING_SCORE,
} from "./teacher.service";
import type {
  FetchAllExamsQuery,
  SaveExamBody,
  SelectedGroup,
  UpdateExamSettingsBody,
} from "./teacher.schema";

/**
 * Teacher exam business rules. No Express types and no direct Prisma access —
 * persistence is delegated to `exam-teacher.repository.ts`.
 */

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 12;

function resolveSelectedGroupId(
  selectedGroups: SaveExamBody["selectedGroups"],
): string | undefined {
  if (!selectedGroups) return undefined;

  if (Array.isArray(selectedGroups)) {
    return selectedGroups[0]?.id;
  }

  return selectedGroups.id;
}

async function assertProblemAccess(
  userId: string,
  problemIds: string[],
): Promise<void> {
  if (problemIds.length === 0) return;

  const problems = await examRepository.findProblemsForAccess(problemIds);

  const invalidIds = problemIds.filter((problemId) => {
    const problem = problems.find((entry) => entry.id === problemId);
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
}

async function assertBulkExamOwnership(
  userId: string,
  examIds: string[],
  action: "delete" | "archive",
): Promise<void> {
  const exams = await examRepository.findExamsByIds(examIds);

  for (const exam of exams) {
    const hasAccess = await canAccessExamWithFallback(
      userId,
      exam.id,
      exam.creatorId,
      PERMISSIONS.EXAM_EDIT,
    );

    if (!hasAccess) {
      throw new ForbiddenError(`Access denied for exam ${exam.id}`);
    }

    if (exam.creatorId === userId) continue;

    const groupId = await teacherRepository.findExamGroupId(exam.id);

    if (!groupId) {
      throw new ForbiddenError(`Only the exam creator can ${action} this exam`);
    }

    const membership = await teacherRepository.findGroupMembership(
      groupId,
      userId,
    );

    if (membership?.roleId !== GROUP_ROLE_IDS.OWNER) {
      throw new ForbiddenError(
        `Only the exam creator or group owner can ${action} exams`,
      );
    }
  }
}

async function notifyExamPublished(params: {
  userId: string;
  examId: string;
  title: string;
  selectedGroups: SaveExamBody["selectedGroups"];
}): Promise<void> {
  const groupIds = Array.isArray(params.selectedGroups)
    ? params.selectedGroups.map((group: SelectedGroup) => group.id)
    : [];

  if (groupIds.length === 0) return;

  try {
    const members = await examRepository.findGroupMembersWithRoles(groupIds);

    const recipientIds = Array.from(
      new Set(
        members
          .filter((member) => member.user.globalRoleId === GLOBAL_ROLE_IDS.ORG_STUDENT)
          .map((member) => member.user.id),
      ),
    );

    if (recipientIds.length === 0) return;

    await teacherRepository.createNotificationRecord({
      title: `New exam published: ${params.title}`,
      message: "An exam has been published for your group(s).",
      type: NotificationType.EXAM,
      priority: NotificationPriority.NORMAL,
      senderId: params.userId,
      examId: params.examId,
      recipientIds,
    });
  } catch (notifyError) {
    console.error("Failed to create exam publish notifications", notifyError);
  }
}

// ---------------------------------------------------------------------------
// Listing / dashboard
// ---------------------------------------------------------------------------

export async function fetchAllExams(
  userId: string,
  query: FetchAllExamsQuery,
) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(query.limit) || Number(query.take) || DEFAULT_PAGE_SIZE),
  );
  const searchValue = String(query.search || query.searchvalue || "");
  const statusFilter = String(query.status || "ALL").toUpperCase();
  const sort = String(query.sort || "newest");
  const now = new Date();

  const whereClause: Prisma.ExamWhereInput = {};

  if (searchValue) {
    whereClause.OR = [
      { title: { contains: searchValue, mode: "insensitive" } },
      { description: { contains: searchValue, mode: "insensitive" } },
    ];
  }

  switch (statusFilter) {
    case "DRAFT":
      whereClause.isPublished = false;
      break;
    case "SCHEDULED":
      whereClause.isPublished = true;
      whereClause.startDate = { gt: now };
      break;
    case "ACTIVE":
      whereClause.isPublished = true;
      whereClause.startDate = { lte: now };
      whereClause.endDate = { gte: now };
      break;
    case "COMPLETED":
      whereClause.isPublished = true;
      whereClause.endDate = { lt: now };
      break;
    default:
      break;
  }

  let orderBy: Prisma.ExamOrderByWithRelationInput;
  switch (sort) {
    case "oldest":
      orderBy = { createdAt: "asc" };
      break;
    case "title_asc":
      orderBy = { title: "asc" };
      break;
    case "title_desc":
      orderBy = { title: "desc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
      break;
  }

  const exams = await examRepository.findExamsForListing(
    whereClause,
    orderBy,
  );

  const authorizedExams: (typeof exams)[number][] = [];

  for (const exam of exams) {
    const canAccess = await canAccessExamWithFallback(
      userId,
      exam.id,
      exam.creatorId,
      PERMISSIONS.EXAM_EDIT,
    );

    if (canAccess) {
      authorizedExams.push(exam);
    }
  }

  const totalCount = authorizedExams.length;
  const skip = (page - 1) * limit;
  const paginatedExams = authorizedExams.slice(skip, skip + limit);

  const examIds = paginatedExams.map((exam) => exam.id);
  const [allAttempts, examGroups] = await Promise.all([
    examRepository.findAttemptScoresForExams(examIds),
    examRepository.findExamGroupLinks(examIds),
  ]);

  const passingMap = new Map<string, { total: number; passing: number }>();
  for (const attempt of allAttempts) {
    const entry = passingMap.get(attempt.examId) || { total: 0, passing: 0 };
    entry.total++;
    if (attempt.totalScore >= EXAM_PASSING_SCORE) entry.passing++;
    passingMap.set(attempt.examId, entry);
  }

  const examGroupIds = new Map<string, string[]>();
  const allGroupIds = new Set<string>();
  for (const link of examGroups) {
    const groups = examGroupIds.get(link.examId) || [];
    groups.push(link.groupId);
    examGroupIds.set(link.examId, groups);
    allGroupIds.add(link.groupId);
  }

  const groupMembers = await examRepository.findGroupMemberLinks(
    Array.from(allGroupIds),
  );

  const groupMemberMap = new Map<string, Set<string>>();
  for (const member of groupMembers) {
    const members = groupMemberMap.get(member.groupId) || new Set<string>();
    members.add(member.userId);
    groupMemberMap.set(member.groupId, members);
  }

  const studentCountMap = new Map<string, number>();
  for (const [examId, groupIds] of examGroupIds) {
    const uniqueStudents = new Set<string>();
    for (const groupId of groupIds) {
      groupMemberMap.get(groupId)?.forEach((id) => uniqueStudents.add(id));
    }
    studentCountMap.set(examId, uniqueStudents.size);
  }

  const enrichedExams = paginatedExams.map((exam) => {
    const passData = passingMap.get(exam.id);

    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      startDate: exam.startDate,
      endDate: exam.endDate,
      status: deriveExamStatus(
        exam.isPublished,
        exam.startDate,
        exam.endDate,
        now,
      ),
      studentCount: studentCountMap.get(exam.id) ?? 0,
      problemCount: exam._count.problems,
      passingPercentage: calculatePassingPercentage(
        passData?.passing ?? 0,
        passData?.total ?? 0,
      ),
      createdAt: exam.createdAt,
      createdBy: {
        id: exam.creator.id,
        name: exam.creator.name,
        email: exam.creator.email,
      },
    };
  });

  return {
    exams: enrichedExams,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

export async function getExamDashboardStats(userId: string) {
  const now = new Date();
  const exams = await examRepository.findAllExamsForDashboard();

  const authorizedExams: typeof exams = [];

  for (const exam of exams) {
    const canAccess = await canAccessExamWithFallback(
      userId,
      exam.id,
      exam.creatorId,
      PERMISSIONS.EXAM_EDIT,
    );

    if (canAccess) {
      authorizedExams.push(exam);
    }
  }

  let draftExams = 0;
  let activeExams = 0;
  let completedExams = 0;

  for (const exam of authorizedExams) {
    const status = deriveExamStatus(
      exam.isPublished,
      exam.startDate,
      exam.endDate,
      now,
    );

    if (status === "DRAFT") draftExams++;
    else if (status === "ACTIVE") activeExams++;
    else if (status === "COMPLETED") completedExams++;
  }

  return {
    totalExams: authorizedExams.length,
    draftExams,
    activeExams,
    completedExams,
  };
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

export async function publishBulkExams(userId: string, testIds: string[]) {
  const exams = await examRepository.findExamsByIds(testIds);

  for (const exam of exams) {
    const hasAccess = await canAccessExamWithFallback(
      userId,
      exam.id,
      exam.creatorId,
      PERMISSIONS.EXAM_PUBLISH,
    );

    if (!hasAccess) {
      throw new ForbiddenError(`Access denied for exam ${exam.id}`);
    }
  }

  await examRepository.publishExamsByIds(testIds);

  return { message: `Successfully published ${testIds.length} exams` };
}

export async function deleteBulkExams(userId: string, testIds: string[]) {
  await assertBulkExamOwnership(userId, testIds, "delete");
  await examRepository.deleteExamsByIds(testIds);

  return { message: `Successfully deleted ${testIds.length} exams` };
}

export async function archiveBulkExams(userId: string, testIds: string[]) {
  await assertBulkExamOwnership(userId, testIds, "archive");
  await examRepository.updateExamsStatus(testIds, ExamStatus.finished);

  return { message: `Successfully archived ${testIds.length} exams` };
}

export async function exportExamsCSV(
  userId: string,
  testIds: string[],
): Promise<{ csvContent: string }> {
  const exams = await examRepository.findExamsByIds(testIds);

  for (const exam of exams) {
    const hasAccess = await canAccessExamWithFallback(
      userId,
      exam.id,
      exam.creatorId,
      PERMISSIONS.EXAM_EDIT,
    );

    if (!hasAccess) {
      throw new ForbiddenError(`Access denied for exam ${exam.id}`);
    }
  }

  const examData = await examRepository.findExamsForExport(testIds);

  const csvRows: string[] = [
    "ID,Title,Status,Student Count,Passing %,Created Date,Start Date,End Date",
  ];

  for (const exam of examData) {
    const attempts = await examRepository.findAttemptScores(exam.id);
    const passingCount = attempts.filter(
      (attempt) => attempt.totalScore >= EXAM_PASSING_SCORE,
    ).length;
    const passingPercentage =
      attempts.length > 0
        ? ((passingCount / attempts.length) * 100).toFixed(2)
        : "0.00";

    const status = exam.isPublished
      ? "Published"
      : exam.status === "finished"
        ? "Finished"
        : "Draft";

    const row = [
      exam.id,
      `"${exam.title.replace(/"/g, '""')}"`,
      status,
      exam._count.enrollments,
      passingPercentage,
      exam.createdAt.toISOString().split("T")[0],
      exam.startDate?.toISOString().split("T")[0] ?? "",
      exam.endDate?.toISOString().split("T")[0] ?? "",
    ];

    csvRows.push(row.join(","));
  }

  return { csvContent: csvRows.join("\n") };
}

// ---------------------------------------------------------------------------
// Exam builder
// ---------------------------------------------------------------------------

export async function draftExam(userId: string) {
  return examRepository.createDraftExam(userId, new Date());
}

export async function duplicateExam(userId: string, examId: string) {
  const originalExam =
    await examRepository.findExamWithProblemsAndGroups(examId);

  if (!originalExam) {
    throw new NotFoundError("Exam not found");
  }

  const hasAccess = await canAccessExamWithFallback(
    userId,
    originalExam.id,
    originalExam.creatorId,
    PERMISSIONS.EXAM_CREATE,
  );

  if (!hasAccess) {
    throw new ForbiddenError("Not authorized");
  }

  const now = new Date();

  return examRepository.createExamCopy({
    creatorId: userId,
    title: `${originalExam.title} (Copy)`,
    description: originalExam.description ?? null,
    durationMin: originalExam.durationMin,
    sebEnabled: originalExam.sebEnabled,
    startDate: now,
    endDate: new Date(now.getTime() + 60 * 60 * 1000),
    problems: originalExam.problems.map((problem) => ({
      order: problem.order,
      problemId: problem.problemId,
    })),
    groupIds: originalExam.examGroups.map((link) => link.groupId),
  });
}

export async function getExam(userId: string, examId: string) {
  const exam = await examRepository.findExamById(examId);
  const notFoundMessage =
    "Exam Not Found or you don't have access to it";

  if (!exam) {
    throw new NotFoundError(notFoundMessage);
  }

  const hasAccess = await canAccessExamWithFallback(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.EXAM_EDIT,
  );

  if (!hasAccess) {
    throw new NotFoundError(notFoundMessage);
  }

  return exam;
}

export async function updateExamSettings(
  userId: string,
  input: UpdateExamSettingsBody,
) {
  if (!input.examId) {
    throw new ValidationError("examId is required");
  }

  const exam = await examRepository.findExamById(input.examId);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  await assertCanAccessExam(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.EXAM_EDIT,
    "Not authorized",
  );

  const parsedStartDate = new Date(input.startDate as string | Date);
  const parsedEndDate = new Date(input.endDate as string | Date);
  const parsedDuration = Number(input.durationMin);

  if (
    Number.isNaN(parsedStartDate.getTime()) ||
    Number.isNaN(parsedEndDate.getTime())
  ) {
    throw new ValidationError("Invalid start or end date");
  }

  if (!Number.isInteger(parsedDuration) || parsedDuration <= 0) {
    throw new ValidationError(
      "Duration must be a positive number of minutes",
    );
  }

  if (parsedStartDate >= parsedEndDate) {
    throw new ValidationError("Start date must be before end date");
  }

  if (input.sebEnabled !== undefined && typeof input.sebEnabled !== "boolean") {
    throw new ValidationError("sebEnabled must be a boolean");
  }

  await examRepository.updateExamSchedule({
    examId: input.examId,
    startDate: parsedStartDate,
    endDate: parsedEndDate,
    durationMin: parsedDuration,
    sebEnabled:
      typeof input.sebEnabled === "boolean" ? input.sebEnabled : undefined,
  });

  return { message: "Exam settings updated successfully" };
}

export async function getAllGroupExams(userId: string, examId: string) {
  const exam = await examRepository.findExamById(examId);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  await assertCanAccessExam(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.EXAM_EDIT,
    "Not authorized",
  );

  return examRepository.findGroupsForExam(examId);
}

export async function getAllExamProblem(userId: string, examId: string) {
  const exam = await examRepository.findExamById(examId);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  await assertCanAccessExam(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.EXAM_EDIT,
    "Not authorized",
  );

  const problems = await examRepository.findExamProblemIds(examId);

  return { problems };
}

export async function saveDraft(userId: string, body: SaveExamBody) {
  const { updatedExamDetails, selectedGroups, selectedProblemsId } = body;

  const exam = await examRepository.findExamById(updatedExamDetails.id);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  await assertCanAccessExam(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.EXAM_EDIT,
    "Not authorized",
  );

  if (exam.isPublished) {
    throw new ValidationError("Published Exam cannot be edited");
  }

  await assertProblemAccess(userId, selectedProblemsId);

  await examRepository.persistExam({
    examId: exam.id,
    title: updatedExamDetails.title,
    description: updatedExamDetails.description || "",
    isPublished: false,
    startDate: updatedExamDetails.startDate,
    endDate: updatedExamDetails.endDate,
    durationMin: updatedExamDetails.durationMin,
    sebEnabled: updatedExamDetails.sebEnabled,
    groupId: resolveSelectedGroupId(selectedGroups),
    problemIds: selectedProblemsId,
  });

  return { message: "Draft saved successfully" };
}

export async function publishExam(userId: string, body: SaveExamBody) {
  const { updatedExamDetails, selectedGroups, selectedProblemsId } = body;

  const exam = await examRepository.findExamById(updatedExamDetails.id);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  await assertCanAccessExam(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.EXAM_PUBLISH,
    "Not authorized",
  );

  if (exam.isPublished) {
    throw new ValidationError("Published Exam cannot be edited");
  }

  await assertProblemAccess(userId, selectedProblemsId);

  const problemCount = await examRepository.countProblemsByIds(
    selectedProblemsId,
  );

  if (problemCount !== selectedProblemsId.length) {
    throw new ValidationError("One or more selected problems no longer exist");
  }

  await examRepository.persistExam({
    examId: exam.id,
    title: updatedExamDetails.title,
    description: updatedExamDetails.description || "",
    isPublished: true,
    startDate: updatedExamDetails.startDate,
    endDate: updatedExamDetails.endDate,
    durationMin: updatedExamDetails.durationMin,
    sebEnabled: updatedExamDetails.sebEnabled,
    groupId: resolveSelectedGroupId(selectedGroups),
    problemIds: selectedProblemsId,
  });

  await notifyExamPublished({
    userId,
    examId: exam.id,
    title: updatedExamDetails.title,
    selectedGroups,
  });

  return { message: "Exam published successfully" };
}

// ---------------------------------------------------------------------------
// Results / AI evaluation
// ---------------------------------------------------------------------------

export async function getExamResults(userId: string, examId: string) {
  const examDetails =
    await examRepository.findExamWithProblemsForResults(examId);

  if (!examDetails) {
    throw new NotFoundError("Exam not found");
  }

  await assertCanAccessExam(
    userId,
    examDetails.id,
    examDetails.creatorId,
    PERMISSIONS.SUBMISSION_VIEW,
    "Not authorized to view this exam's results",
  );

  const examAttempts = await examRepository.findExamAttemptsForResults(examId);

  const studentResults = examAttempts.map((attempt) => {
    const problemSubmissions = new Map<
      string,
      (typeof attempt.submissions)[number][]
    >();

    attempt.submissions.forEach((submission) => {
      const existing = problemSubmissions.get(submission.problemId) || [];
      existing.push(submission);
      problemSubmissions.set(submission.problemId, existing);
    });

    const problemScores = examDetails.problems.map((examProblem) => {
      const submissions = problemSubmissions.get(examProblem.problemId) || [];

      let bestScore = 0;
      let latestStatus: string | null = null;
      let passedTestcases = 0;
      let totalTestcases = 0;
      let sourceCode: string | null = null;

      if (submissions.length > 0) {
        const bestSubmission = submissions.reduce((best, current) => {
          const currentScore =
            current.totalTestcases > 0
              ? (current.passedTestcases / current.totalTestcases) * 100
              : 0;
          const bestCurrentScore =
            best.totalTestcases > 0
              ? (best.passedTestcases / best.totalTestcases) * 100
              : 0;

          return currentScore > bestCurrentScore ? current : best;
        });

        bestScore =
          bestSubmission.totalTestcases > 0
            ? Math.round(
                (bestSubmission.passedTestcases /
                  bestSubmission.totalTestcases) *
                  100,
              )
            : 0;
        latestStatus = bestSubmission.status;
        passedTestcases = bestSubmission.passedTestcases;
        totalTestcases = bestSubmission.totalTestcases;
        sourceCode = bestSubmission.sourceCode;
      }

      return {
        problemId: examProblem.problemId,
        problemTitle: examProblem.problem.title,
        problemNumber: examProblem.problem.number,
        bestScore,
        attempts: submissions.length,
        latestStatus,
        passedTestcases,
        totalTestcases,
        sourceCode,
      };
    });

    const totalScore =
      examDetails.problems.length > 0
        ? Math.round(
            problemScores.reduce((sum, problem) => sum + problem.bestScore, 0) /
              examDetails.problems.length,
          )
        : 0;

    return {
      studentId: attempt.student.id,
      studentName: attempt.student.name,
      studentEmail: attempt.student.email,
      attemptId: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      expiresAt: attempt.expiresAt,
      totalScore,
      lastHeartbeatAt: attempt.lastHeartbeatAt,
      disconnectCount: attempt.disconnectCount,
      problemScores,
    };
  });

  const submittedAttempts = examAttempts.filter(
    (attempt) =>
      attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED",
  );
  const inProgressAttempts = examAttempts.filter(
    (attempt) => attempt.status === "IN_PROGRESS",
  );
  const notStartedAttempts = examAttempts.filter(
    (attempt) => attempt.status === "NOT_STARTED",
  );

  const scores = studentResults
    .filter(
      (result) =>
        result.status === "SUBMITTED" || result.status === "AUTO_SUBMITTED",
    )
    .map((result) => result.totalScore);

  const averageScore =
    scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;
  const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
  const completionRate =
    examAttempts.length > 0
      ? (submittedAttempts.length / examAttempts.length) * 100
      : 0;

  return {
    examDetails: {
      id: examDetails.id,
      title: examDetails.title,
      description: examDetails.description,
      durationMin: examDetails.durationMin,
      startDate: examDetails.startDate,
      endDate: examDetails.endDate,
      isPublished: examDetails.isPublished,
      status: examDetails.status,
      sebEnabled: examDetails.sebEnabled,
      problems: examDetails.problems.map((examProblem) => ({
        order: examProblem.order,
        problem: examProblem.problem,
      })),
    },
    studentResults,
    statistics: {
      totalStudents: examAttempts.length,
      submitted: submittedAttempts.length,
      inProgress: inProgressAttempts.length,
      notStarted: notStartedAttempts.length,
      averageScore: Math.round(averageScore * 100) / 100,
      highestScore,
      lowestScore,
      completionRate: Math.round(completionRate * 100) / 100,
    },
  };
}

export async function getExamAIResults(userId: string, examId: string) {
  const exam = await examRepository.findExamWithCreator(examId);

  if (!exam) {
    throw new NotFoundError("Exam Not Found");
  }

  await assertCanAccessExam(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.ANALYTICS_VIEW,
    "You Don't Have Access To This Exam",
  );

  return examRepository.findSubmissionsWithAiEvaluation(exam.id);
}

export type StartAiEvaluationResult =
  | { kind: "no-submissions" }
  | { kind: "started"; total: number };

export async function startAiEvaluation(
  userId: string,
  examId: string,
): Promise<StartAiEvaluationResult> {
  const exam = await examRepository.findExamById(examId);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  await assertCanAccessExam(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.SUBMISSION_GRADE,
    "Not authorized to evaluate this exam",
  );

  const now = new Date();

  if (exam.endDate > now) {
    throw new ValidationError("Exam not ready for AI evaluation");
  }

  await examRepository.updateExamStatus(exam.id, ExamStatus.completed);

  const submissions = await examRepository.findPendingAiSubmissions(examId);

  if (submissions.length === 0) {
    return { kind: "no-submissions" };
  }

  const submissionIds = submissions.map((submission) => submission.id);

  // Mark the exam before queueing so the UI can poll status immediately.
  await examRepository.updateExamStatus(examId, ExamStatus.ai_processing);

  await sendBatchToSQS(submissionIds);

  return { kind: "started", total: submissionIds.length };
}

export async function getAiEvaluationStatus(userId: string, examId: string) {
  const exam = await examRepository.findExamById(examId);

  if (!exam) {
    throw new NotFoundError("Exam not found");
  }

  await assertCanAccessExam(
    userId,
    exam.id,
    exam.creatorId,
    PERMISSIONS.ANALYTICS_VIEW,
    "Not authorized to view this exam's status",
  );

  const [total, completed] = await Promise.all([
    examRepository.countFinalSubmissions(examId),
    examRepository.countCompletedAiSubmissions(examId),
  ]);

  return { total, completed };
}
