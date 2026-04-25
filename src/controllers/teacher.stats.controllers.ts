// ...existing code...

import { PERMISSIONS } from "@/permissions/permission.constants";
import { hasPermission } from "@/permissions/permission.service";
import prisma from "@/utils/prisma";
import { NextFunction, Request, Response } from "express";

async function canViewGroupAnalytics(
  userId: string,
  groupId: string,
  creatorId: string,
): Promise<boolean> {
  const allowed = await hasPermission(userId, PERMISSIONS.ANALYTICS_VIEW, groupId);
  return allowed || creatorId === userId;
}

export const getGroupOverallStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.groupOverallStats.findUnique({
      where: { groupId },
    });

    return res.status(200).json(stats ?? null);
  } catch (error) {
    next(error);
  }
};

export const getGroupProblemStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);
    const { take, skip, searchValue } = req.query;

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.groupProblemStats.findMany({
      where: {
        groupId,
        ...(searchValue && {
          problem: {
            title: { contains: String(searchValue), mode: "insensitive" },
          },
        }),
      },
      include: {
        problem: {
          select: {
            id: true,
            number: true,
            title: true,
            difficulty: true,
          },
        },
      },
      take: Number(take) ?? 10,
      skip: Number(skip) ?? 0,
      orderBy: { attemptedCount: "desc" },
    });

    return res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

export const getStudentOverallStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.studentOverallStats.findMany({
      where: { groupId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { avgScore: "desc" },
    });

    return res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

export const getStudentProblemStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);
    const studentId = String(req.query.studentId);

    if (!groupId || !studentId)
      return res
        .status(400)
        .json({ error: "groupId and studentId are required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.studentProblemStats.findMany({
      where: { groupId, studentId },
      include: {
        problem: {
          select: {
            id: true,
            number: true,
            title: true,
            difficulty: true,
          },
        },
      },
      orderBy: { attempts: "desc" },
    });

    return res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ENHANCED ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /teacher/analytics/students
 * Enhanced student analytics with advanced filtering, sorting, pagination, and virtualization support
 */
export const getAnalyticsStudents = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    // Pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50); // Max 100 per page
    const skip = (page - 1) * limit;

    // Filters
    const search = String(req.query.search || "").trim();
    const scoreMin = Number(req.query.scoreMin) || 0;
    const scoreMax = Number(req.query.scoreMax) || 100;
    const completionMin = Number(req.query.completionMin) || 0;
    const completionMax = Number(req.query.completionMax) || 100;
    const completionStatus = String(req.query.completionStatus || "all"); // all, completed, incomplete
    const weakTopic = String(req.query.weakTopic || "");

    // Sorting
    const sortBy = String(req.query.sortBy || "avgScore"); // avgScore, attempts, lastActive, completionPercentage
    const sortOrder = String(req.query.sortOrder || "desc").toLowerCase();

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    // Build where clause with filters
    const whereClause: any = { groupId };

    // Text search on student name/email
    if (search) {
      whereClause.student = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    // Score range filter
    if (scoreMin !== 0 || scoreMax !== 100) {
      whereClause.avgScore = { gte: scoreMin, lte: scoreMax };
    }

    // Completion percentage filter
    if (completionMin !== 0 || completionMax !== 100) {
      whereClause.completionPercentage = { gte: completionMin, lte: completionMax };
    }

    // Completion status filter
    if (completionStatus === "completed") {
      whereClause.completionPercentage = { gte: 100 };
    } else if (completionStatus === "incomplete") {
      whereClause.completionPercentage = { lt: 100 };
    }

    // Weak topic filter (contains weak topic)
    if (weakTopic) {
      whereClause.weakTopics = {
        contains: JSON.stringify(weakTopic),
      };
    }

    // Sort mapping
    const sortMapping: Record<string, any> = {
      avgScore: { avgScore: sortOrder },
      attempts: { totalAttempts: sortOrder },
      lastActive: { lastActive: sortOrder },
      completionPercentage: { completionPercentage: sortOrder },
      name: { student: { name: sortOrder } },
    };

    const orderBy = sortMapping[sortBy] || sortMapping.avgScore;

    // Get total count
    const total = await prisma.studentOverallStats.count({ where: whereClause });

    // Get paginated students
    const students = await prisma.studentOverallStats.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    });

    // Calculate rank based on score (for display purposes)
    const allStudentsByScore = await prisma.studentOverallStats.findMany({
      where: { groupId },
      select: { studentId: true, avgScore: true },
      orderBy: { avgScore: "desc" },
    });

    const rankMap = new Map(
      allStudentsByScore.map((s, idx) => [s.studentId, idx + 1]),
    );

    const response = students.map((s) => ({
      id: s.studentId,
      name: s.student.name,
      email: s.student.email,
      rank: rankMap.get(s.studentId) || 0,
      avgScore: s.avgScore,
      totalAttempts: s.totalAttempts,
      avgAttemptsPerProblem: s.avgAttemptsPerProblem,
      completionPercentage: s.completionPercentage,
      weakTopics: s.weakTopics,
      strongTopics: s.strongTopics,
      scoreTrend: s.scoreTrend,
      lastActive: s.lastActive,
      avgTimePerProblem: s.avgTimePerProblem,
    }));

    return res.status(200).json({
      data: response,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/analytics/students/:studentId/details
 * Get detailed analytics for a specific student (for row expansion)
 */
export const getStudentDetailedAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const studentId = String(req.params.studentId); // Ensure it's a string
    const groupId = String(req.query.groupId);

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    // Problem performance
    const problemStats = await prisma.studentProblemStats.findMany({
      where: { studentId, groupId },
      include: {
        problem: { select: { id: true, number: true, title: true, difficulty: true } },
      },
      orderBy: { attempts: "desc" },
    });

    // Submission timeline (last 10)
    const submissions = await prisma.submission.findMany({
      where: { userId: studentId, examId: { not: null } },
      include: {
        problem: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Exam history
    const examResults = await prisma.examResult.findMany({
      where: { userId: studentId },
      include: { exam: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return res.status(200).json({
      problemPerformance: problemStats.map((p) => ({
        problemId: p.problemId,
        problemNumber: p.problem.number,
        problemTitle: p.problem.title,
        difficulty: p.problem.difficulty,
        attempts: p.attempts,
        solved: p.solved,
        isWeak: p.isWeak,
        successRate: p.successRate,
        avgTime: p.avgTime,
      })),
      recentSubmissions: submissions.map((s) => ({
        id: s.id,
        problem: s.problem?.title,
        status: s.status,
        score: s.totalTestcases > 0 ? (s.passedTestcases / s.totalTestcases) * 100 : 0,
        createdAt: s.createdAt,
      })),
      examHistory: examResults.map((r) => ({
        examId: r.examId,
        examTitle: r.exam.title,
        score: r.score,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/analytics/overview
 * Get dashboard overview cards data
 */
export const getAnalyticsOverview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    // Get group overall stats
    const groupStats = await prisma.groupOverallStats.findUnique({
      where: { groupId },
    });

    // Get student stats distribution
    const studentStats = await prisma.studentOverallStats.findMany({
      where: { groupId },
      select: {
        avgScore: true,
        completionPercentage: true,
        lastActive: true,
        weakTopics: true,
      },
    });

    // Calculate derived metrics
    const activeStudents = studentStats.filter((s) => {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return s.lastActive && new Date(s.lastActive) > last24h;
    }).length;

    // Find weakest and hardest problems
    const problemStats = await prisma.groupProblemStats.findMany({
      where: { groupId },
      select: { problemId: true, successRate: true, failureRate: true },
      orderBy: { successRate: "asc" },
      take: 5,
    });

    const weakestProblem = problemStats[0];
    const hardestByFailure = await prisma.groupProblemStats.findFirst({
      where: { groupId },
      orderBy: { failureRate: "desc" },
      select: { problemId: true },
    });

    // Get problem titles
    const weakestProblemData = weakestProblem
      ? await prisma.problem.findUnique({
          where: { id: weakestProblem.problemId },
          select: { id: true, title: true, number: true },
        })
      : null;

    const hardestProblemData = hardestByFailure
      ? await prisma.problem.findUnique({
          where: { id: hardestByFailure.problemId },
          select: { id: true, title: true, number: true },
        })
      : null;

    return res.status(200).json({
      totalStudents: groupStats?.totalStudents || 0,
      activeStudents,
      avgScore: groupStats?.avgScoreAllExams || 0,
      completionRate: groupStats?.completionRate || 0,
      overallPassRate: groupStats?.overallPassRate || 0,
      weakestProblem: weakestProblemData,
      hardestProblem: hardestProblemData,
      avgAttemppts: studentStats.length > 0 
        ? studentStats.reduce((sum, s) => sum + 1, 0) / studentStats.length 
        : 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/analytics/charts
 * Get data for dashboard charts (score distribution, trend, etc.)
 */
export const getAnalyticsCharts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);
    const chartType = String(req.query.type || "all"); // all, distribution, trend, completion, time

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const response: any = {};

    // Score distribution
    if (chartType === "all" || chartType === "distribution") {
      const students = await prisma.studentOverallStats.findMany({
        where: { groupId },
        select: { avgScore: true },
      });

      const distribution = {
        "0-20": 0,
        "20-40": 0,
        "40-60": 0,
        "60-80": 0,
        "80-100": 0,
      } as Record<string, number>;

      students.forEach((s) => {
        if (s.avgScore < 20) distribution["0-20"]++;
        else if (s.avgScore < 40) distribution["20-40"]++;
        else if (s.avgScore < 60) distribution["40-60"]++;
        else if (s.avgScore < 80) distribution["60-80"]++;
        else distribution["80-100"]++;
      });

      response.scoreDistribution = distribution;
    }

    // Performance trend (last 7 days)
    if (chartType === "all" || chartType === "trend") {
      const examResults = await prisma.examResult.findMany({
        where: {
          exam: { examGroups: { some: { groupId } } },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        select: { createdAt: true, score: true },
      });

      const trendByDay: Record<string, number[]> = {};
      examResults.forEach((r) => {
        const day = r.createdAt.toISOString().split("T")[0];
        if (!trendByDay[day]) trendByDay[day] = [];
        trendByDay[day].push(r.score);
      });

      response.performanceTrend = Object.entries(trendByDay).map(([date, scores]) => ({
        date,
        avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      }));
    }

    // Completion rate by student tiers
    if (chartType === "all" || chartType === "completion") {
      const students = await prisma.studentOverallStats.findMany({
        where: { groupId },
        select: { completionPercentage: true },
      });

      response.completionDistribution = {
        notStarted: students.filter((s) => s.completionPercentage === 0).length,
        inProgress: students.filter(
          (s) => s.completionPercentage > 0 && s.completionPercentage < 100,
        ).length,
        completed: students.filter((s) => s.completionPercentage === 100).length,
      };
    }

    // Time spent distribution
    if (chartType === "all" || chartType === "time") {
      const problems = await prisma.groupProblemStats.findMany({
        where: { groupId },
        select: { problemId: true, avgTime: true },
        orderBy: { avgTime: "desc" },
        take: 10,
      });

      const problemData = await Promise.all(
        problems.map(async (p) => {
          const problem = await prisma.problem.findUnique({
            where: { id: p.problemId },
            select: { title: true, number: true },
          });
          return {
            problemNumber: problem?.number,
            problemTitle: problem?.title,
            avgTime: p.avgTime,
          };
        }),
      );

      response.timeSpentByProblem = problemData;
    }

    return res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// PROBLEM + EXAM ANALYTICS (group-scoped)
// ============================================================================

/**
 * GET /teacher/analytics/problems
 * Paginated problem analytics for a group
 */
export const getAnalyticsProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const difficultyTier = String(req.query.difficultyTier || "all").toLowerCase();
    const sortBy = String(req.query.sortBy || "attemptedCount");
    const sortOrder = String(req.query.sortOrder || "desc").toLowerCase();

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const whereClause: any = {
      groupId,
      ...(difficultyTier !== "all" ? { difficultyTier } : {}),
      ...(search
        ? {
            problem: {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const sortMapping: Record<string, any> = {
      attemptedCount: { attemptedCount: sortOrder },
      successRate: { successRate: sortOrder },
      failureRate: { failureRate: sortOrder },
      avgTime: { avgTime: sortOrder },
      acceptedCount: { acceptedCount: sortOrder },
      totalAttempts: { totalAttempts: sortOrder },
      avgRuntime: { avgRuntime: sortOrder },
    };
    const orderBy = sortMapping[sortBy] || sortMapping.attemptedCount;

    const total = await prisma.groupProblemStats.count({ where: whereClause });

    const rows = await prisma.groupProblemStats.findMany({
      where: whereClause,
      include: {
        problem: {
          select: { id: true, number: true, title: true, difficulty: true },
        },
      },
      orderBy,
      skip,
      take: limit,
    });

    const data = rows.map((r) => ({
      problemId: r.problemId,
      problemNumber: r.problem.number,
      problemTitle: r.problem.title,
      difficulty: r.problem.difficulty,
      difficultyTier: r.difficultyTier,
      successRate: r.successRate,
      failureRate: r.failureRate,
      totalStudents: r.totalStudents,
      attemptedCount: r.attemptedCount,
      acceptedCount: r.acceptedCount,
      totalAttempts: r.totalAttempts,
      avgRuntime: r.avgRuntime,
      avgMemory: r.avgMemory,
      avgTime: r.avgTime,
      updatedAt: r.updatedAt,
    }));

    return res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/analytics/problems/:problemId/details
 * Summary for a single problem within a group
 */
export const getAnalyticsProblemDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);
    const problemId = String(req.params.problemId);

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.groupProblemStats.findUnique({
      where: { groupId_problemId: { groupId, problemId } },
      include: {
        problem: {
          select: { id: true, number: true, title: true, difficulty: true },
        },
      },
    });

    if (!stats) {
      return res.status(404).json({ error: "Problem analytics not found" });
    }

    return res.status(200).json({
      problem: stats.problem,
      stats: {
        difficultyTier: stats.difficultyTier,
        successRate: stats.successRate,
        failureRate: stats.failureRate,
        totalStudents: stats.totalStudents,
        attemptedCount: stats.attemptedCount,
        acceptedCount: stats.acceptedCount,
        totalAttempts: stats.totalAttempts,
        avgRuntime: stats.avgRuntime,
        avgMemory: stats.avgMemory,
        avgTime: stats.avgTime,
        updatedAt: stats.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/analytics/problems/:problemId/students
 * Paginated student list for a specific problem within a group
 */
export const getAnalyticsProblemStudents = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);
    const problemId = String(req.params.problemId);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const solvedStatus = String(req.query.solvedStatus || "all"); // all, solved, unsolved, weak

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const whereClause: any = { groupId, problemId };

    if (solvedStatus === "solved") whereClause.solved = true;
    else if (solvedStatus === "unsolved") whereClause.solved = false;
    else if (solvedStatus === "weak") whereClause.isWeak = true;

    if (search) {
      whereClause.student = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const total = await prisma.studentProblemStats.count({ where: whereClause });
    const rows = await prisma.studentProblemStats.findMany({
      where: whereClause,
      include: {
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { attempts: "desc" },
      skip,
      take: limit,
    });

    const data = rows.map((r) => ({
      studentId: r.studentId,
      name: r.student.name,
      email: r.student.email,
      attempts: r.attempts,
      solved: r.solved,
      isWeak: r.isWeak,
      successRate: r.successRate,
      avgTime: r.avgTime,
      lastAttemptAt: r.lastAttemptAt,
    }));

    return res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/analytics/exams
 * Paginated exam list for a group with group-scoped analytics attached
 */
export const getAnalyticsExams = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "all");
    const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
    const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;

    const sortBy = String(req.query.sortBy || "endDate");
    const sortOrder = String(req.query.sortOrder || "desc").toLowerCase();

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const whereClause: any = {
      examGroups: { some: { groupId } },
      ...(search
        ? { title: { contains: search, mode: "insensitive" } }
        : {}),
      ...(status !== "all" ? { status } : {}),
      ...(dateFrom || dateTo
        ? {
            endDate: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    };

    const sortMapping: Record<string, any> = {
      endDate: { endDate: sortOrder },
      startDate: { startDate: sortOrder },
      title: { title: sortOrder },
      durationMin: { durationMin: sortOrder },
    };
    const orderBy = sortMapping[sortBy] || sortMapping.endDate;

    const total = await prisma.exam.count({ where: whereClause });
    const exams = await prisma.exam.findMany({
      where: whereClause,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        durationMin: true,
        groupExamAnalytics: {
          where: { groupId },
          take: 1,
        },
      },
    });

    const data = exams.map((e) => {
      const ga = e.groupExamAnalytics[0];
      return {
        examId: e.id,
        examTitle: e.title,
        status: e.status,
        startDate: e.startDate,
        endDate: e.endDate,
        durationMin: e.durationMin,
        analytics: ga
          ? {
              totalEnrolled: ga.totalEnrolled,
              totalAttempted: ga.totalAttempted,
              totalCompleted: ga.totalCompleted,
              completionRate: ga.completionRate,
              avgScore: ga.avgScore,
              highestScore: ga.highestScore,
              lowestScore: ga.lowestScore,
              medianScore: ga.medianScore,
              scoreDistribution: ga.scoreDistribution,
              avgTimeToComplete: ga.avgTimeToComplete,
              avgAttempts: ga.avgAttempts,
              totalSubmissions: ga.totalSubmissions,
              acceptedCount: ga.acceptedCount,
              partialCount: ga.partialCount,
              failedCount: ga.failedCount,
              updatedAt: ga.updatedAt,
            }
          : null,
      };
    });

    return res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/analytics/exams/:examId/details
 * Group-scoped analytics details for a specific exam
 */
export const getAnalyticsExamDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);
    const examId = String(req.params.examId);

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!(await canViewGroupAnalytics(user.id, groupId, group.creatorId)))
      return res.status(403).json({ error: "Not authorized" });

    const analytics = await prisma.groupExamAnalytics.findUnique({
      where: { groupId_examId: { groupId, examId } },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            status: true,
            startDate: true,
            endDate: true,
            durationMin: true,
          },
        },
      },
    });

    if (!analytics) {
      return res.status(404).json({ error: "Exam analytics not found" });
    }

    const difficulties = Array.isArray(analytics.problemDifficulties)
      ? (analytics.problemDifficulties as any[])
      : [];

    const problemIds = difficulties
      .map((d) => String(d.problemId))
      .filter(Boolean);

    const problems = problemIds.length
      ? await prisma.problem.findMany({
          where: { id: { in: problemIds } },
          select: { id: true, number: true, title: true, difficulty: true },
        })
      : [];

    const problemMap = new Map(problems.map((p) => [p.id, p]));

    const problemDifficulties = difficulties.map((d) => {
      const p = problemMap.get(String(d.problemId));
      return {
        problemId: String(d.problemId),
        problemNumber: p?.number,
        problemTitle: p?.title,
        difficulty: p?.difficulty,
        avgScore: Number(d.avgScore || 0),
        failureRate: Number(d.failureRate || 0),
      };
    });

    return res.status(200).json({
      exam: analytics.exam,
      analytics: {
        totalEnrolled: analytics.totalEnrolled,
        totalAttempted: analytics.totalAttempted,
        totalCompleted: analytics.totalCompleted,
        completionRate: analytics.completionRate,
        avgScore: analytics.avgScore,
        highestScore: analytics.highestScore,
        lowestScore: analytics.lowestScore,
        medianScore: analytics.medianScore,
        scoreDistribution: analytics.scoreDistribution,
        avgTimeToComplete: analytics.avgTimeToComplete,
        avgAttempts: analytics.avgAttempts,
        totalSubmissions: analytics.totalSubmissions,
        acceptedCount: analytics.acceptedCount,
        partialCount: analytics.partialCount,
        failedCount: analytics.failedCount,
        updatedAt: analytics.updatedAt,
      },
      problemDifficulties,
    });
  } catch (error) {
    next(error);
  }
};
