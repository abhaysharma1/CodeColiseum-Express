import prisma from "@/utils/prisma";
import { ExecutionStatus } from "../../generated/prisma/enums";

/**
 * Analytics Service - Helper functions for calculating and updating analytics statistics
 * Handles both real-time and batch updates for analytics models
 */

// ============================================================================
// BATCH UPDATES (called when exam finalizes - cron job)
// ============================================================================

/**
 * Detect weak topics for a student based on their problem stats
 * A topic is weak if:
 * 1. Success rate < 50% OR
 * 2. Failed in recent attempts (last 5 problems attempted)
 */
export async function detectWeakTopics(
  studentId: string,
  groupId: string,
): Promise<string[]> {
  try {
    const problemStats = await prisma.studentProblemStats.findMany({
      where: { studentId, groupId },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            tags: {
              select: {
                tag: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { lastAttemptAt: "desc" },
    });

    const weakTopics = new Set<string>();

    for (const stat of problemStats) {
      // Low success rate
      if (stat.successRate < 50) {
        // Extract topics from problem tags
        stat.problem.tags.forEach((pt) => {
          weakTopics.add(pt.tag.name);
        });
      }
    }

    // If no statistical weak topics, try recent failures
    if (weakTopics.size === 0) {
      const recentFailures = problemStats.slice(0, 5).filter((s) => !s.solved);
      recentFailures.forEach((stat) => {
        stat.problem.tags.forEach((pt) => {
          weakTopics.add(pt.tag.name);
        });
      });
    }

    return Array.from(weakTopics);
  } catch (error) {
    console.error("Error detecting weak topics:", error);
    return [];
  }
}

/**
 * Detect strong topics for a student
 * A topic is strong if: success rate > 80%
 */
export async function detectStrongTopics(
  studentId: string,
  groupId: string,
): Promise<string[]> {
  try {
    const problemStats = await prisma.studentProblemStats.findMany({
      where: { studentId, groupId, successRate: { gt: 80 } },
      include: {
        problem: {
          select: {
            tags: {
              select: {
                tag: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const strongTopics = new Set<string>();
    problemStats.forEach((stat) => {
      stat.problem.tags.forEach((pt) => {
        strongTopics.add(pt.tag.name);
      });
    });

    return Array.from(strongTopics);
  } catch (error) {
    console.error("Error detecting strong topics:", error);
    return [];
  }
}

/**
 * Calculate score trend for a student
 * Compares average of last 5 attempts vs prior 5 attempts
 * Returns trend type and value (percentage change)
 */
export async function calculateScoreTrend(
  studentId: string,
  groupId: string,
): Promise<{ trend: string; trendValue: number }> {
  try {
    const examResults = await prisma.examResult.findMany({
      where: {
        userId: studentId,
        exam: { examGroups: { some: { groupId } } },
      },
      select: { score: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (examResults.length < 2) {
      return { trend: "stable", trendValue: 0 };
    }

    const recent = examResults.slice(0, 5);
    const prior = examResults.slice(5, 10);

    if (prior.length === 0) {
      return { trend: "stable", trendValue: 0 };
    }

    const recentAvg = recent.reduce((sum, r) => sum + r.score, 0) / recent.length;
    const priorAvg = prior.reduce((sum, r) => sum + r.score, 0) / prior.length;

    const percentChange = ((recentAvg - priorAvg) / priorAvg) * 100;
    const trend =
      percentChange > 5 ? "improving" : percentChange < -5 ? "declining" : "stable";

    return { trend, trendValue: percentChange };
  } catch (error) {
    console.error("Error calculating score trend:", error);
    return { trend: "stable", trendValue: 0 };
  }
}

/**
 * Calculate completion percentage for student in group
 * Percentage of exams completed / total exams in group
 */
export async function calculateCompletionPercentage(
  studentId: string,
  groupId: string,
): Promise<number> {
  try {
    const totalExams = await prisma.exam.count({
      where: {
        examGroups: { some: { groupId } },
      },
    });

    if (totalExams === 0) return 0;

    const completedExams = await prisma.examResult.findMany({
      where: {
        userId: studentId,
        exam: { examGroups: { some: { groupId } } },
      },
      distinct: ["examId"],
    });

    return (completedExams.length / totalExams) * 100;
  } catch (error) {
    console.error("Error calculating completion percentage:", error);
    return 0;
  }
}

/**
 * Recalculate all stats for a student in a group
 * Called after exam finalization to refresh derived metrics
 */
export async function recalculateStudentStats(
  studentId: string,
  groupId: string,
) {
  try {
    const [weakTopics, strongTopics, { trend, trendValue }, completionPercentage] =
      await Promise.all([
        detectWeakTopics(studentId, groupId),
        detectStrongTopics(studentId, groupId),
        calculateScoreTrend(studentId, groupId),
        calculateCompletionPercentage(studentId, groupId),
      ]);

    // Calculate average time per problem
    const problemStats = await prisma.studentProblemStats.findMany({
      where: { studentId, groupId },
      select: { avgTime: true, totalTime: true },
    });

    const avgTimePerProblem =
      problemStats.length > 0
        ? problemStats.reduce((sum, p) => sum + p.avgTime, 0) / problemStats.length
        : 0;

    // Calculate total time spent
    const totalTimeSpent = problemStats.reduce((sum, p) => sum + p.totalTime, 0);

    // Update StudentOverallStats
    await prisma.studentOverallStats.updateMany({
      where: { studentId, groupId },
      data: {
        weakTopics: weakTopics,
        strongTopics: strongTopics,
        scoreTrend: trend,
        scoreTrendValue: trendValue,
        completionPercentage,
        avgTimePerProblem,
        totalTimeSpent,
      },
    });
  } catch (error) {
    console.error("Error recalculating student stats:", error);
  }
}

/**
 * Calculate group-wide completion rate
 * Percentage of students with at least 1 completed exam
 */
export async function calculateGroupCompletionRate(groupId: string): Promise<number> {
  try {
    const groupMembers = await prisma.groupMember.count({
      where: { groupId },
    });

    if (groupMembers === 0) return 0;

    const membersWithCompletedExams = await prisma.examResult.findMany({
      where: {
        exam: { examGroups: { some: { groupId } } },
      },
      distinct: ["userId"],
    });

    return (membersWithCompletedExams.length / groupMembers) * 100;
  } catch (error) {
    console.error("Error calculating group completion rate:", error);
    return 0;
  }
}

/**
 * Recalculate all per-problem and per-student-problem stats for a group
 * Computes and upserts GroupProblemStats and StudentProblemStats from raw submission data
 * Called after exam finalization to refresh derived metrics
 */
export async function recalculateGroupProblemStats(groupId: string) {
  try {
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const studentIds = members.map(m => m.userId);

    const examProblems = await prisma.examProblem.findMany({
      where: { exam: { examGroups: { some: { groupId } } } },
      select: { problemId: true },
    });
    const problemIds = [...new Set(examProblems.map(ep => ep.problemId))];

    if (studentIds.length === 0 || problemIds.length === 0) {
      return { weakestProblemId: undefined, hardestProblemId: undefined };
    }

    for (const problemId of problemIds) {
      const rawSubmissions = await prisma.submission.findMany({
        where: {
          problemId,
          userId: { in: studentIds },
          exam: { examGroups: { some: { groupId } } },
        },
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          status: true,
          executionTime: true,
          memory: true,
          createdAt: true,
        },
      });

      const submissions = rawSubmissions.filter((s): s is typeof s & Record<"userId", string> => s.userId !== null);

      if (submissions.length === 0) continue;

      // Group submissions by student
      const byStudent = new Map<string, typeof submissions>();
      for (const sub of submissions) {
        if (!byStudent.has(sub.userId)) {
          byStudent.set(sub.userId, []);
        }
        byStudent.get(sub.userId)!.push(sub);
      }

      let attemptedCount = 0;
      let acceptedCount = 0;
      let totalSubmissionsCount = 0;
      let totalAvgTime = 0;
      let totalRuntime = 0;
      let totalMemory = 0;
      let studentWithStatsCount = 0;

      for (const [studentId, subs] of byStudent) {
        const attempts = subs.length;
        const accepted = subs.some(s => s.status === ExecutionStatus.ACCEPTED);
        const acceptedSubs = subs.filter(s => s.status === ExecutionStatus.ACCEPTED).length;
        const successRate = attempts > 0 ? (acceptedSubs / attempts) * 100 : 0;
        const totalTime = subs.reduce((sum, s) => sum + (s.executionTime || 0) / 1000 / 60, 0);
        const avgTime = attempts > 0 ? totalTime / attempts : 0;

        await prisma.studentProblemStats.upsert({
          where: {
            studentId_problemId_groupId: { studentId, problemId, groupId },
          },
          create: {
            studentId,
            problemId,
            groupId,
            attempts,
            solved: accepted,
            isWeak: successRate < 50,
            successRate,
            avgTime,
            totalTime,
            lastAttemptAt: subs[subs.length - 1].createdAt,
            firstAttemptAt: subs[0].createdAt,
          },
          update: {
            attempts,
            solved: accepted,
            isWeak: successRate < 50,
            successRate,
            avgTime,
            totalTime,
            lastAttemptAt: subs[subs.length - 1].createdAt,
          },
        });

        attemptedCount++;
        if (accepted) acceptedCount++;
        totalSubmissionsCount += attempts;
        totalAvgTime += avgTime;
        studentWithStatsCount++;

        for (const s of subs) {
          totalRuntime += (s.executionTime || 0) / 1000;
          totalMemory += (s.memory || 0);
        }
      }

      const successRate = attemptedCount > 0 ? (acceptedCount / attemptedCount) * 100 : 0;
      const failureRate = 100 - successRate;
      const avgTime = studentWithStatsCount > 0 ? totalAvgTime / studentWithStatsCount : 0;
      const avgRuntime = submissions.length > 0 ? totalRuntime / submissions.length : 0;
      const avgMemory = submissions.length > 0 ? totalMemory / submissions.length : 0;

      let difficultyTier = "medium";
      if (successRate > 75) difficultyTier = "easy";
      else if (successRate < 40) difficultyTier = "hard";

      await prisma.groupProblemStats.upsert({
        where: { groupId_problemId: { groupId, problemId } },
        create: {
          groupId,
          problemId,
          totalStudents: studentIds.length,
          attemptedCount,
          acceptedCount,
          totalAttempts: totalSubmissionsCount,
          successRate,
          failureRate,
          avgTime,
          avgRuntime,
          avgMemory,
          difficultyTier,
        },
        update: {
          totalStudents: studentIds.length,
          attemptedCount,
          acceptedCount,
          totalAttempts: totalSubmissionsCount,
          successRate,
          failureRate,
          avgTime,
          avgRuntime,
          avgMemory,
          difficultyTier,
        },
      });
    }

    // Return weakest/hardest problem IDs for GroupOverallStats
    const weakest = await prisma.groupProblemStats.findFirst({
      where: { groupId },
      orderBy: { successRate: "asc" },
      select: { problemId: true },
    });

    const hardest = await prisma.groupProblemStats.findFirst({
      where: { groupId },
      orderBy: { failureRate: "desc" },
      select: { problemId: true },
    });

    return {
      weakestProblemId: weakest?.problemId,
      hardestProblemId: hardest?.problemId,
    };
  } catch (error) {
    console.error("Error recalculating group problem stats:", error);
    return { weakestProblemId: undefined, hardestProblemId: undefined };
  }
}

/**
 * Recalculate all stats for a group
 * Called after exam finalization to refresh derived metrics
 */
export async function recalculateGroupStats(groupId: string) {
  try {
    const { weakestProblemId, hardestProblemId } =
      await recalculateGroupProblemStats(groupId);
    const completionRate = await calculateGroupCompletionRate(groupId);

    // Calculate active students (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const activeStudents = await prisma.studentOverallStats.count({
      where: {
        groupId,
        lastActive: { gte: sevenDaysAgo },
      },
    });

    // Calculate average time per student
    const students = await prisma.studentOverallStats.findMany({
      where: { groupId },
      select: { totalTimeSpent: true },
    });

    const avgTimePerStudent =
      students.length > 0
        ? students.reduce((sum, s) => sum + s.totalTimeSpent, 0) / students.length
        : 0;

    const totalTimeSpent = students.reduce((sum, s) => sum + s.totalTimeSpent, 0);

    // Update GroupOverallStats
    await prisma.groupOverallStats.updateMany({
      where: { groupId },
      data: {
        activeStudents,
        completionRate,
        weakestProblemId: weakestProblemId || undefined,
        hardestProblemId: hardestProblemId || undefined,
        avgTimePerStudent,
        totalTimeSpent,
      },
    });
  } catch (error) {
    console.error("Error recalculating group stats:", error);
  }
}

/**
 * Calculate organization-wide analytics
 * Called periodically or after major events
 */
export async function recalculateOrganizationStats(organizationId: string) {
  try {
    // For now, aggregating from all groups
    // In a real scenario, you'd have a proper organization model

    const groups = await prisma.group.findMany({
      where: {
        // Filter by organization if you have that field
        // For now, just get all groups
      },
      select: {
        id: true,
        groupOverallStats: true,
        members: true,
      },
    });

    if (groups.length === 0) {
      return;
    }

    let totalStudents = 0;
    let totalScore = 0;
    let totalPassRate = 0;
    const allStudents = await prisma.user.findMany({
      select: { id: true },
    });

    for (const group of groups) {
      totalStudents += group.members.length;
      if (group.groupOverallStats) {
        totalScore += group.groupOverallStats.avgScoreAllExams || 0;
        totalPassRate += group.groupOverallStats.overallPassRate || 0;
      }
    }

    const avgOrgScore = groups.length > 0 ? totalScore / groups.length : 0;
    const avgOrgPassRate = groups.length > 0 ? totalPassRate / groups.length : 0;

    // Upsert organization analytics
    await prisma.organizationAnalytics.upsert({
      where: { organizationId },
      update: {
        totalGroups: groups.length,
        totalStudents,
        avgScore: avgOrgScore,
        overallPassRate: avgOrgPassRate,
        completionRate: avgOrgPassRate, // Placeholder
        avgTimePerStudent: 0, // Would need to calculate from all groups
        updatedAt: new Date(),
      },
      create: {
        organizationId,
        totalGroups: groups.length,
        totalStudents,
        activeGroups: groups.length,
        avgScore: avgOrgScore,
        overallPassRate: avgOrgPassRate,
        completionRate: avgOrgPassRate,
        totalProblems: 0,
        avgTimePerStudent: 0,
        totalTimeSpent: 0,
        participationRate: 100,
        avgSubmissionsPerStudent: 0,
      },
    });
  } catch (error) {
    console.error("Error recalculating organization stats:", error);
  }
}

/**
 * Calculate exam-level analytics
 * Called when exam finalization is triggered
 */
export async function calculateExamAnalytics(examId: string) {
  try {
    const examResults = await prisma.examResult.findMany({
      where: { examId },
    });

    const examAttempts = await prisma.examAttempt.findMany({
      where: { examId },
    });

    if (examResults.length === 0) {
      return;
    }

    const scores = examResults.map((r) => r.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    const sortedScores = [...scores].sort((a, b) => a - b);
    const medianScore =
      sortedScores.length % 2 === 0
        ? (sortedScores[sortedScores.length / 2 - 1] +
            sortedScores[sortedScores.length / 2]) /
          2
        : sortedScores[Math.floor(sortedScores.length / 2)];

    const completionRate = (examResults.length / examAttempts.length) * 100;

    // Calculate score distribution
    const distribution: Record<string, number> = {
      "0-20": 0,
      "20-40": 0,
      "40-60": 0,
      "60-80": 0,
      "80-100": 0,
    };

    scores.forEach((score) => {
      if (score < 20) distribution["0-20"]++;
      else if (score < 40) distribution["20-40"]++;
      else if (score < 60) distribution["40-60"]++;
      else if (score < 80) distribution["60-80"]++;
      else distribution["80-100"]++;
    });

    // Upsert exam analytics
    await prisma.examAnalytics.upsert({
      where: { examId },
      update: {
        totalEnrolled: examAttempts.length,
        totalAttempted: examAttempts.length,
        totalCompleted: examResults.length,
        completionRate,
        avgScore,
        highestScore,
        lowestScore,
        medianScore,
        scoreDistribution: distribution,
        updatedAt: new Date(),
      },
      create: {
        examId,
        totalEnrolled: examAttempts.length,
        totalAttempted: examAttempts.length,
        totalCompleted: examResults.length,
        completionRate,
        avgScore,
        highestScore,
        lowestScore,
        medianScore,
        scoreDistribution: distribution,
        totalSubmissions: 0,
        acceptedCount: 0,
        partialCount: 0,
        failedCount: 0,
      },
    });
  } catch (error) {
    console.error("Error calculating exam analytics:", error);
  }
}

/**
 * Calculate group-scoped exam analytics
 * Used for teacher analytics (an exam can be linked to multiple groups)
 */
export async function calculateGroupExamAnalytics(examId: string, groupId: string) {
  try {
    const groupMemberIds = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });

    const studentIds = groupMemberIds.map((m) => m.userId);
    const totalEnrolled = studentIds.length;

    if (studentIds.length === 0) {
      await prisma.groupExamAnalytics.upsert({
        where: { groupId_examId: { groupId, examId } },
        update: {
          totalEnrolled: 0,
          totalAttempted: 0,
          totalCompleted: 0,
          completionRate: 0,
          avgScore: 0,
          highestScore: 0,
          lowestScore: 0,
          medianScore: 0,
          scoreDistribution: {},
          problemDifficulties: [],
          avgTimeToComplete: 0,
          avgAttempts: 0,
          totalSubmissions: 0,
          acceptedCount: 0,
          partialCount: 0,
          failedCount: 0,
          updatedAt: new Date(),
        },
        create: {
          groupId,
          examId,
          totalEnrolled: 0,
          totalAttempted: 0,
          totalCompleted: 0,
          completionRate: 0,
          avgScore: 0,
          highestScore: 0,
          lowestScore: 0,
          medianScore: 0,
          scoreDistribution: {},
          problemDifficulties: [],
          avgTimeToComplete: 0,
          avgAttempts: 0,
          totalSubmissions: 0,
          acceptedCount: 0,
          partialCount: 0,
          failedCount: 0,
        },
      });
      return;
    }

    const examProblems = await prisma.examProblem.findMany({
      where: { examId },
      select: { problemId: true },
    });
    const problemIds = examProblems.map((p) => p.problemId);
    const problemCount = problemIds.length;

    const examAttempts = await prisma.examAttempt.findMany({
      where: {
        examId,
        studentId: { in: studentIds },
      },
      select: {
        id: true,
        startedAt: true,
        submittedAt: true,
      },
    });

    const attemptIds = examAttempts.map((a) => a.id);
    const totalAttempted = examAttempts.length;

    const examResults = await prisma.examResult.findMany({
      where: {
        examId,
        userId: { in: studentIds },
      },
      select: { score: true },
    });
    const totalCompleted = examResults.length;

    const completionRate =
      totalAttempted > 0 ? (totalCompleted / totalAttempted) * 100 : 0;

    const scores = examResults.map((r) => r.score);
    const avgScore = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
    const highestScore = scores.length ? Math.max(...scores) : 0;
    const lowestScore = scores.length ? Math.min(...scores) : 0;

    const sortedScores = [...scores].sort((a, b) => a - b);
    const medianScore =
      sortedScores.length === 0
        ? 0
        : sortedScores.length % 2 === 0
          ? (sortedScores[sortedScores.length / 2 - 1] +
              sortedScores[sortedScores.length / 2]) /
            2
          : sortedScores[Math.floor(sortedScores.length / 2)];

    const distribution: Record<string, number> = {
      "0-20": 0,
      "20-40": 0,
      "40-60": 0,
      "60-80": 0,
      "80-100": 0,
    };

    scores.forEach((score) => {
      if (score < 20) distribution["0-20"]++;
      else if (score < 40) distribution["20-40"]++;
      else if (score < 60) distribution["40-60"]++;
      else if (score < 80) distribution["60-80"]++;
      else distribution["80-100"]++;
    });

    // Average time to complete (only for submitted attempts)
    const completedAttempts = examAttempts.filter((a) => a.submittedAt);
    const avgTimeToComplete = completedAttempts.length
      ? completedAttempts.reduce((sum, a) => {
          const mins =
            (new Date(a.submittedAt as Date).getTime() -
              new Date(a.startedAt).getTime()) /
            1000 /
            60;
          return sum + Math.max(0, mins);
        }, 0) / completedAttempts.length
      : 0;

    // Submission stats (all submissions for group attemptIds)
    let totalSubmissions = 0;
    let acceptedCount = 0;
    let partialCount = 0;
    let failedCount = 0;

    if (attemptIds.length) {
      totalSubmissions = await prisma.submission.count({
        where: { attemptId: { in: attemptIds } },
      });

      const grouped = await prisma.submission.groupBy({
        by: ["status"],
        where: { attemptId: { in: attemptIds } },
        _count: { status: true },
      });

      for (const row of grouped) {
        const c = row._count.status;
        if (row.status === ExecutionStatus.ACCEPTED) acceptedCount += c;
        else if (row.status === ExecutionStatus.PARTIAL) partialCount += c;
        else failedCount += c;
      }
    }

    const avgAttempts =
      totalAttempted > 0 && problemCount > 0
        ? totalSubmissions / (totalAttempted * problemCount)
        : 0;

    // Per-problem breakdown from final submissions
    let finalSubmissions: Array<{
      attemptId: string;
      problemId: string;
      passedTestcases: number;
      totalTestcases: number;
    }> = [];

    if (attemptIds.length && problemIds.length) {
      finalSubmissions = await prisma.submission.findMany({
        where: {
          attemptId: { in: attemptIds },
          problemId: { in: problemIds },
          isFinal: true,
        },
        select: {
          attemptId: true,
          problemId: true,
          passedTestcases: true,
          totalTestcases: true,
        },
      });
    }

    const finalByAttemptProblem = new Map<string, (typeof finalSubmissions)[number]>();
    for (const s of finalSubmissions) {
      finalByAttemptProblem.set(`${s.attemptId}:${s.problemId}`, s);
    }

    const passScore = 50;
    const problemDifficulties = problemIds.map((problemId) => {
      if (totalAttempted === 0) {
        return { problemId, avgScore: 0, failureRate: 0 };
      }

      let totalScore = 0;
      let failed = 0;

      for (const attemptId of attemptIds) {
        const sub = finalByAttemptProblem.get(`${attemptId}:${problemId}`);
        const score = sub
          ? sub.totalTestcases > 0
            ? Math.round((sub.passedTestcases / sub.totalTestcases) * 100)
            : 0
          : 0;

        totalScore += score;
        if (score < passScore) failed += 1;
      }

      return {
        problemId,
        avgScore: totalScore / totalAttempted,
        failureRate: (failed / totalAttempted) * 100,
      };
    });

    await prisma.groupExamAnalytics.upsert({
      where: { groupId_examId: { groupId, examId } },
      update: {
        totalEnrolled,
        totalAttempted,
        totalCompleted,
        completionRate,
        avgScore,
        highestScore,
        lowestScore,
        medianScore,
        scoreDistribution: distribution,
        problemDifficulties,
        avgTimeToComplete,
        avgAttempts,
        totalSubmissions,
        acceptedCount,
        partialCount,
        failedCount,
        updatedAt: new Date(),
      },
      create: {
        groupId,
        examId,
        totalEnrolled,
        totalAttempted,
        totalCompleted,
        completionRate,
        avgScore,
        highestScore,
        lowestScore,
        medianScore,
        scoreDistribution: distribution,
        problemDifficulties,
        avgTimeToComplete,
        avgAttempts,
        totalSubmissions,
        acceptedCount,
        partialCount,
        failedCount,
      },
    });
  } catch (error) {
    console.error("Error calculating group exam analytics:", error);
  }
}
