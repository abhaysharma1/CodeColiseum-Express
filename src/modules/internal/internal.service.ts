import { logger } from "@/config/logger";
import { runInTransaction } from "@/infrastructure/database/transactions";
import {
  calculateExamAnalytics,
  calculateGroupExamAnalytics,
  recalculateGroupStats,
  recalculateStudentStats,
} from "@/services/analytics.service";
import * as internalRepository from "./internal.repository";
import type { RecomputeAnalyticsInput } from "./internal.schema";

export interface FinalizeExamsResult {
  message: string;
  finalizedExamIds?: string[];
}

export interface RecomputeAnalyticsResult {
  message: string;
  count?: number;
}

export interface AttemptScoreInput {
  passedTestcases: number;
  totalTestcases: number;
}

/**
 * Exam score is the average of per-problem percentages. Unsolved problems
 * contribute zero, matching the historical scoring rule.
 */
export function calculateAttemptScore(
  submissions: AttemptScoreInput[],
  problemCount: number,
): number {
  if (problemCount <= 0) {
    return 0;
  }

  let totalScore = 0;

  for (const submission of submissions) {
    totalScore +=
      submission.totalTestcases > 0
        ? Math.round(
            (submission.passedTestcases / submission.totalTestcases) * 100,
          )
        : 0;
  }

  return Math.round(totalScore / problemCount);
}

function logBackgroundFailure(context: string, error: unknown): void {
  logger.error(context, {
    reason: error instanceof Error ? error.message : error,
  });
}

async function updateGroupStatistics(
  groupId: string,
  passScore = 50,
): Promise<void> {
  const examIds = await internalRepository.findExamIdsForGroup(groupId);
  const allResults = await internalRepository.findResultsForExams(examIds);
  const totalStudents =
    await internalRepository.countGroupMembers(groupId);

  // totalExams counts distinct exams that produced at least one result.
  const distinctExamIds = [...new Set(allResults.map((result) => result.examId))];
  const totalExams = distinctExamIds.length;

  const avgScoreAllExams =
    allResults.length > 0
      ? allResults.reduce((sum, result) => sum + result.score, 0) /
        allResults.length
      : 0;

  const examAvgMap: Record<string, number> = {};

  for (const examId of distinctExamIds) {
    const examResults = allResults.filter((result) => result.examId === examId);
    examAvgMap[examId] =
      examResults.reduce((sum, result) => sum + result.score, 0) /
      examResults.length;
  }

  const examAverages = Object.values(examAvgMap);
  const highestExamAvg =
    examAverages.length > 0 ? Math.max(...examAverages) : 0;
  const lowestExamAvg =
    examAverages.length > 0 ? Math.min(...examAverages) : 0;

  const studentBestScore: Record<string, number> = {};

  for (const result of allResults) {
    if (
      studentBestScore[result.userId] === undefined ||
      result.score > studentBestScore[result.userId]
    ) {
      studentBestScore[result.userId] = result.score;
    }
  }

  const passedStudents = Object.values(studentBestScore).filter(
    (score) => score >= passScore,
  ).length;

  const overallPassRate =
    totalStudents > 0 ? passedStudents / totalStudents : 0;

  const memberIds = await internalRepository.findGroupMemberIds(groupId);

  await runInTransaction(async (tx) => {
    await internalRepository.upsertGroupStats(tx, {
      groupId,
      totalExams,
      totalStudents,
      avgScoreAllExams,
      overallPassRate,
      highestExamAvg,
      lowestExamAvg,
    });

    for (const memberId of memberIds) {
      const studentResults = allResults.filter(
        (result) => result.userId === memberId,
      );

      const studentTotalExams = new Set(
        studentResults.map((result) => result.examId),
      ).size;

      const studentTotalScore = studentResults.reduce(
        (sum, result) => sum + result.score,
        0,
      );

      const studentAvgScore =
        studentTotalExams > 0 ? studentTotalScore / studentTotalExams : 0;

      await internalRepository.upsertStudentStats(tx, {
        groupId,
        studentId: memberId,
        totalScore: studentTotalScore,
        totalExams: studentTotalExams,
        avgScore: studentAvgScore,
      });
    }
  });

  void recalculateGroupStats(groupId).catch((error) =>
    logBackgroundFailure("failed to recalculate group analytics", error),
  );

  for (const memberId of memberIds) {
    void recalculateStudentStats(memberId, groupId).catch((error) =>
      logBackgroundFailure("failed to recalculate student analytics", error),
    );
  }
}

async function finalizeExam(exam: {
  id: string;
  examGroups: { groupId: string }[];
  problems: { id: string }[];
}): Promise<void> {
  const now = new Date();
  const activeAttempts = await internalRepository.findActiveAttempts(exam.id);

  const submissions =
    await internalRepository.findFinalSubmissionsByAttemptIds(
      activeAttempts.map((attempt) => attempt.id),
    );

  const submissionsByAttempt = new Map<
    string,
    AttemptScoreInput[]
  >();

  for (const submission of submissions) {
    const current = submissionsByAttempt.get(submission.attemptId) ?? [];
    current.push(submission);
    submissionsByAttempt.set(submission.attemptId, current);
  }

  const attempts = activeAttempts.map((attempt) => ({
    attemptId: attempt.id,
    studentId: attempt.studentId,
    totalScore: calculateAttemptScore(
      submissionsByAttempt.get(attempt.id) ?? [],
      exam.problems.length,
    ),
  }));

  // Result creation, attempt state and exam status are atomic: a failure can no
  // longer leave an exam half-finalized.
  await runInTransaction((tx) =>
    internalRepository.persistExamFinalization(tx, {
      examId: exam.id,
      attempts,
      finalizedAt: now,
    }),
  );

  for (const examGroup of exam.examGroups) {
    void calculateGroupExamAnalytics(exam.id, examGroup.groupId).catch(
      (error) =>
        logBackgroundFailure(
          "failed to calculate group exam analytics",
          error,
        ),
    );

    await updateGroupStatistics(examGroup.groupId);
  }

  void calculateExamAnalytics(exam.id).catch((error) =>
    logBackgroundFailure("failed to calculate exam analytics", error),
  );
}

/**
 * Finalizes every published exam whose end date has passed. For each exam:
 * auto-submit in-progress attempts, persist results atomically, then refresh
 * group/student/exam analytics.
 */
export async function finalizeExpiredExams(): Promise<FinalizeExamsResult> {
  const expiredExams = await internalRepository.findExpiredExams(new Date());

  if (expiredExams.length === 0) {
    return { message: "No exams to finalize" };
  }

  const finalizedExamIds: string[] = [];

  for (const exam of expiredExams) {
    await finalizeExam(exam);
    finalizedExamIds.push(exam.id);
  }

  return {
    message: `Finalized ${finalizedExamIds.length} exam(s)`,
    finalizedExamIds,
  };
}

/**
 * Recomputes analytics for the requested exam/group pairs (or all pairs).
 */
export async function recomputeAnalytics(
  input: RecomputeAnalyticsInput,
): Promise<RecomputeAnalyticsResult> {
  const examGroups = await internalRepository.findExamGroupPairs(input);

  if (examGroups.length === 0) {
    return { message: "No matching exam-groups found" };
  }

  await Promise.all(
    examGroups.map((examGroup) =>
      calculateGroupExamAnalytics(examGroup.examId, examGroup.groupId),
    ),
  );

  if (input.examId) {
    await calculateExamAnalytics(input.examId);
  }

  if (input.groupId) {
    await recalculateGroupStats(input.groupId);
  }

  return {
    message: `Recomputed analytics for ${examGroups.length} exam-group pair(s)`,
    count: examGroups.length,
  };
}
