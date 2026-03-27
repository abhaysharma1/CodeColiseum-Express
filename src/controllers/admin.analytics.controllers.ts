import { PERMISSIONS } from "@/permissions/permission.constants";
import { hasPermission } from "@/permissions/permission.service";
import prisma from "@/utils/prisma";
import { NextFunction, Request, Response } from "express";

/**
 * Check if user is organization admin
 * For now, using globalRoleId lookup - adapt as needed for your org structure
 */
async function isOrgAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { globalRoleId: true },
  });

  // You'll need to check against your org_admin role ID
  // For now, assuming globalRoleId of "role_platform_admin" or similar means org admin
  return user?.globalRoleId === "role_platform_admin" || user?.globalRoleId === "role_org_admin";
}

/**
 * GET /admin/analytics/overview
 * Organization-wide analytics overview
 */
export const getOrgAnalyticsOverview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    // Check org admin permission
    if (!(await isOrgAdmin(user.id))) {
      return res.status(403).json({ error: "Not authorized - org admin only" });
    }

    // For now, aggregating from all groups (adjust based on your organization model)
    const orgId = "all"; // Placeholder - adapt based on your org structure

    const orgStats = await prisma.organizationAnalytics.findUnique({
      where: { organizationId: orgId },
    });

    if (!orgStats) {
      // Calculate fresh if not cached
      const groups = await prisma.group.findMany({
        select: {
          id: true,
          groupOverallStats: true,
          members: true,
        },
      });

      let totalStudents = 0;
      let totalScore = 0;
      let totalPassRate = 0;
      let completedStudents = 0;

      for (const group of groups) {
        totalStudents += group.members.length;
        if (group.groupOverallStats) {
          totalScore += group.groupOverallStats.avgScoreAllExams || 0;
          totalPassRate += group.groupOverallStats.overallPassRate || 0;
        }
      }

      const avgScore = groups.length > 0 ? totalScore / groups.length : 0;
      const avgPassRate = groups.length > 0 ? totalPassRate / groups.length : 0;

      return res.status(200).json({
        totalGroups: groups.length,
        totalStudents,
        avgScore,
        completionRate: avgPassRate * 100,
        overallPassRate: avgPassRate * 100,
      });
    }

    return res.status(200).json(orgStats);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /admin/analytics/groups
 * List all groups with their analytics
 */
export const getOrgAnalyticsGroups = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    // Check org admin permission
    if (!(await isOrgAdmin(user.id))) {
      return res.status(403).json({ error: "Not authorized - org admin only" });
    }

    // Pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    // Get all groups with their stats
    const total = await prisma.group.count();

    const groups = await prisma.group.findMany({
      include: {
        groupOverallStats: true,
        members: { select: { userId: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const response = groups.map((g) => ({
      id: g.id,
      name: g.name,
      creator: { id: g.creator.id, name: g.creator.name, email: g.creator.email },
      totalStudents: g.members.length,
      totalExams: g.groupOverallStats?.totalExams || 0,
      avgScore: g.groupOverallStats?.avgScoreAllExams || 0,
      completionRate: g.groupOverallStats?.completionRate || 0,
      passRate: g.groupOverallStats?.overallPassRate || 0,
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
 * GET /admin/analytics/students
 * Organization-wide student analytics across all groups
 */
export const getOrgAnalyticsStudents = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    // Check org admin permission
    if (!(await isOrgAdmin(user.id))) {
      return res.status(403).json({ error: "Not authorized - org admin only" });
    }

    // Pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    // Filters
    const search = String(req.query.search || "").trim();
    const scoreMin = Number(req.query.scoreMin) || 0;
    const scoreMax = Number(req.query.scoreMax) || 100;
    const groupId = req.query.groupId ? String(req.query.groupId) : undefined;

    // Build where clause
    const whereClause: any = {};

    if (search) {
      whereClause.student = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    if (scoreMin !== 0 || scoreMax !== 100) {
      whereClause.avgScore = { gte: scoreMin, lte: scoreMax };
    }

    if (groupId) {
      whereClause.groupId = groupId;
    }

    // Get total count
    const total = await prisma.studentOverallStats.count({ where: whereClause });

    // Get paginated students
    const students = await prisma.studentOverallStats.findMany({
      where: whereClause,
      include: {
        student: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: { avgScore: "desc" },
      skip,
      take: limit,
    });

    const response = students.map((s) => ({
      id: s.studentId,
      name: s.student.name,
      email: s.student.email,
      group: { id: s.group.id, name: s.group.name },
      avgScore: s.avgScore,
      totalExams: s.totalExams,
      completionPercentage: s.completionPercentage,
      lastActive: s.lastActive,
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
 * GET /admin/analytics/exams
 * Organization-wide exam analytics
 */
export const getOrgAnalyticsExams = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    // Check org admin permission
    if (!(await isOrgAdmin(user.id))) {
      return res.status(403).json({ error: "Not authorized - org admin only" });
    }

    // Pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    // Get total count
    const total = await prisma.exam.count();

    // Get exams with analytics
    const exams = await prisma.exam.findMany({
      include: {
        examAnalytics: true,
        creator: { select: { id: true, name: true } },
        examGroups: { select: { groupId: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const response = exams.map((e) => ({
      id: e.id,
      title: e.title,
      creator: { id: e.creator.id, name: e.creator.name },
      groups: e.examGroups.length,
      totalEnrolled: e.examAnalytics?.totalEnrolled || 0,
      totalCompleted: e.examAnalytics?.totalCompleted || 0,
      avgScore: e.examAnalytics?.avgScore || 0,
      completionRate: e.examAnalytics?.completionRate || 0,
      status: e.status,
      createdAt: e.createdAt,
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
 * GET /admin/analytics/problems
 * Organization-wide problem difficulty analysis
 */
export const getOrgAnalyticsProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    // Check org admin permission
    if (!(await isOrgAdmin(user.id))) {
      return res.status(403).json({ error: "Not authorized - org admin only" });
    }

    // Pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    // Sort by most failed problems
    const problems = await prisma.groupProblemStats.findMany({
      select: {
        problemId: true,
        successRate: true,
        failureRate: true,
        totalAttempts: true,
        problem: { select: { id: true, number: true, title: true, difficulty: true } },
      },
      orderBy: { failureRate: "desc" },
      skip,
      take: limit,
    });

    // Get total unique problems
    const total = await prisma.problem.count();

    const response = problems.map((p) => ({
      id: p.problemId,
      number: p.problem.number,
      title: p.problem.title,
      difficulty: p.problem.difficulty,
      successRate: p.successRate,
      failureRate: p.failureRate,
      totalAttempts: p.totalAttempts,
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
 * GET /teacher/stats/summary
 * Dashboard summary statistics for teacher
 */
export const getDashboardSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;

    // Get all groups where teacher is creator
    const groups = await prisma.group.findMany({
      where: {
        creatorId: user.id,
      },
      select: { id: true },
    });

    const groupIds = groups.map((g) => g.id);

    // Get total exams created by teacher
    const totalTests = await prisma.exam.count({
      where: {
        creatorId: user.id,
      },
    });

    // Get total active students across groups
    const activeStudents = await prisma.groupMember.count({
      where: {
        groupId: { in: groupIds },
      },
    });

    // Get average score across all exam attempts (using totalScore from ExamAttempt)
    const scoreAgg = await prisma.examAttempt.aggregate({
      where: {
        exam: {
          creatorId: user.id,
        },
      },
      _avg: {
        totalScore: true,
      },
    });

    const averageScore = scoreAgg._avg?.totalScore ?? 0;

    // Get completion rate (submitted / total enrollments)
    const totalEnrollments = await prisma.examEnrollment.count({
      where: {
        exam: {
          creatorId: user.id,
        },
      },
    });

    const completedEnrollments = await prisma.examAttempt.count({
      where: {
        exam: {
          creatorId: user.id,
        },
        status: {
          in: ["SUBMITTED"],
        },
      },
    });

    const completionRate =
      totalEnrollments > 0 ? (completedEnrollments / totalEnrollments) * 100 : 0;

    // Get tests created this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const testsThisMonth = await prisma.exam.count({
      where: {
        creatorId: user.id,
        createdAt: { gte: startOfMonth },
      },
    });

    // Calculate trends (compare last 7 days with previous 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentStudentsCount = await prisma.groupMember.count({
      where: {
        groupId: { in: groupIds },
        addedAt: { gte: sevenDaysAgo },
      },
    });

    const previousStudentsCount = await prisma.groupMember.count({
      where: {
        groupId: { in: groupIds },
        addedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
      },
    });

    const activeStudentsTrend =
      previousStudentsCount > 0
        ? ((recentStudentsCount - previousStudentsCount) /
            previousStudentsCount) *
          100
        : 0;

    // Score trend (compare last 7 days with previous 7 days)
    const recentAvgScore = await prisma.examAttempt.aggregate({
      where: {
        exam: {
          creatorId: user.id,
        },
        startedAt: { gte: sevenDaysAgo },
      },
      _avg: { totalScore: true },
    });

    const previousAvgScore = await prisma.examAttempt.aggregate({
      where: {
        exam: {
          creatorId: user.id,
        },
        startedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
      },
      _avg: { totalScore: true },
    });

    const recentAvg = recentAvgScore._avg?.totalScore ?? 0;
    const prevAvg = previousAvgScore._avg?.totalScore ?? 0;
    const averageScoreTrend =
      prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;

    return res.status(200).json({
      activeStudents,
      totalTests,
      averageScore: Math.round(averageScore * 100) / 100,
      completionRate: Math.round(completionRate * 100) / 100,
      testsThisMonth,
      activeStudentsTrend: Math.round(activeStudentsTrend * 100) / 100,
      averageScoreTrend: Math.round(averageScoreTrend * 100) / 100,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/exam/stats/chart-data
 * Time series data for performance charts
 */
export const getChartData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;
    const days = Number(req.query.days) || 7;

    // Get exams with submissions for the last N days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const chartData: any[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayName = date.toLocaleDateString("en-US", { weekday: "short" });

      // Get all exam attempts for this day
      const attempts = await prisma.examAttempt.findMany({
        where: {
          exam: {
            creatorId: user.id,
          },
          startedAt: { gte: date, lt: nextDate },
        },
        select: { totalScore: true },
      });

      const avgScore =
        attempts.length > 0
          ? attempts.reduce((acc, attempt) => acc + (attempt.totalScore || 0), 0) /
            attempts.length
          : 0;

      chartData.push({
        date: dayName,
        avgScore: Math.round(avgScore * 100) / 100,
        studentCount: attempts.length,
      });
    }

    return res.status(200).json(chartData);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/exam/recent-activity
 * Recent activity feed
 */
export const getRecentActivity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;
    const limit = Number(req.query.limit) || 10;

    // Get recent exams created
    const recentExams = await prisma.exam.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        createdAt: true,
        isPublished: true,
      },
    });

    // Get recent exam attempts (submissions)
    const recentAttempts = await prisma.examAttempt.findMany({
      where: {
        exam: {
          creatorId: user.id,
        },
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        student: {
          select: { name: true, email: true },
        },
        exam: {
          select: { title: true },
        },
        startedAt: true,
        status: true,
      },
    });

    // Get recent groups created
    const recentGroups = await prisma.group.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: { members: true },
        },
      },
    });

    // Combine and sort by date
    const activities: any[] = [
      ...recentExams.map((exam) => ({
        id: exam.id,
        type: exam.isPublished ? "exam_published" : "exam_created",
        title: `${exam.isPublished ? "Published" : "Created"} exam: ${exam.title}`,
        timestamp: exam.createdAt,
        metadata: { examId: exam.id },
      })),
      ...recentAttempts.map((attempt) => ({
        id: attempt.id,
        type: "student_submission",
        title: `${attempt.student.name} completed exam: ${attempt.exam.title}`,
        description: `Status: ${attempt.status}`,
        timestamp: attempt.startedAt,
        metadata: { studentId: attempt.student.email },
      })),
      ...recentGroups.map((group) => ({
        id: group.id,
        type: "group_created",
        title: `Created group: ${group.name}`,
        description: `${group._count.members} students added`,
        timestamp: group.createdAt,
        metadata: { groupId: group.id },
      })),
    ];

    // Sort by date descending and take top N
    const sortedActivities = activities
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, limit);

    return res.status(200).json(sortedActivities);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /teacher/exam/top-students
 * Top performing students
 */
export const getTopStudents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;
    const limit = Number(req.query.limit) || 5;

    // Get student overall stats for teacher's groups
    const topStudents = await prisma.studentOverallStats.findMany({
      where: {
        group: {
          creatorId: user.id,
        },
      },
      orderBy: { avgScore: "desc" },
      take: limit,
      select: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        avgScore: true,
        completionPercentage: true,
      },
    });

    const result = topStudents.map((stat, idx) => ({
      id: stat.student.id,
      name: stat.student.name,
      email: stat.student.email,
      rank: idx + 1,
      avgScore: Math.round(stat.avgScore * 100) / 100,
      completionPercentage: Math.round(stat.completionPercentage * 100) / 100,
    }));

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
