import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedParams,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as groupAnalyticsService from "./group-analytics.service";
import type {
  AnalyticsExamsQuery,
  AnalyticsProblemStudentsQuery,
  AnalyticsProblemsQuery,
  AnalyticsStudentsQuery,
  ChartsQuery,
  GroupProblemsQuery,
} from "./group-analytics.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const getGroupOverallStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);
    const stats = await groupAnalyticsService.getGroupOverallStats(
      userId,
      groupId,
    );
    return res.status(200).json(stats);
  },
);

export const getGroupProblemStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<GroupProblemsQuery>(req);
    const stats = await groupAnalyticsService.getGroupProblemStats(
      userId,
      query,
    );
    return res.status(200).json(stats);
  },
);

export const getStudentOverallStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);
    const stats = await groupAnalyticsService.getStudentOverallStats(
      userId,
      groupId,
    );
    return res.status(200).json(stats);
  },
);

export const getStudentProblemStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<{ groupId: string; studentId: string }>(req);
    const stats = await groupAnalyticsService.getStudentProblemStats(
      userId,
      query,
    );
    return res.status(200).json(stats);
  },
);

export const getAnalyticsStudents = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<AnalyticsStudentsQuery>(req);
    const result = await groupAnalyticsService.getAnalyticsStudents(
      userId,
      query,
    );
    return res.status(200).json(result);
  },
);

export const getStudentDetailedAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { studentId } = getValidatedParams<{ studentId: string }>(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);

    const result = await groupAnalyticsService.getStudentDetailedAnalytics({
      userId,
      groupId,
      studentId,
    });

    return res.status(200).json(result);
  },
);

export const getAnalyticsOverview = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);
    const result = await groupAnalyticsService.getAnalyticsOverview(
      userId,
      groupId,
    );
    return res.status(200).json(result);
  },
);

export const getAnalyticsCharts = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<ChartsQuery>(req);
    const result = await groupAnalyticsService.getAnalyticsCharts(
      userId,
      query,
    );
    return res.status(200).json(result);
  },
);

export const getAnalyticsProblems = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<AnalyticsProblemsQuery>(req);
    const result = await groupAnalyticsService.getAnalyticsProblems(
      userId,
      query,
    );
    return res.status(200).json(result);
  },
);

export const getAnalyticsProblemDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { problemId } = getValidatedParams<{ problemId: string }>(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);

    const result = await groupAnalyticsService.getAnalyticsProblemDetails({
      userId,
      groupId,
      problemId,
    });

    return res.status(200).json(result);
  },
);

export const getAnalyticsProblemStudents = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { problemId } = getValidatedParams<{ problemId: string }>(req);
    const query = getValidatedQuery<AnalyticsProblemStudentsQuery>(req);

    const result = await groupAnalyticsService.getAnalyticsProblemStudents({
      userId,
      problemId,
      query,
    });

    return res.status(200).json(result);
  },
);

export const getAnalyticsExams = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<AnalyticsExamsQuery>(req);
    const result = await groupAnalyticsService.getAnalyticsExams(userId, query);
    return res.status(200).json(result);
  },
);

export const getAnalyticsExamDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedParams<{ examId: string }>(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);

    const result = await groupAnalyticsService.getAnalyticsExamDetails({
      userId,
      groupId,
      examId,
    });

    return res.status(200).json(result);
  },
);

export const exportAnalyticsCSV = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);

    const data = await groupAnalyticsService.getAnalyticsExportData(
      userId,
      groupId,
    );
    const csv = groupAnalyticsService.buildAnalyticsCsv(data);
    const filename = `analytics_${groupId}_${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  },
);

export const exportAnalyticsPDF = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { groupId } = getValidatedQuery<{ groupId: string }>(req);

    const data = await groupAnalyticsService.getAnalyticsExportData(
      userId,
      groupId,
    );
    const { group, groupStats, students, problems, exams } = data;

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const filename = `analytics_${groupId}_${new Date().toISOString().split("T")[0]}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const font = "Helvetica";
    const fontBold = "Helvetica-Bold";

    const h1 = (text: string, y?: number) => {
      doc
        .font(fontBold)
        .fontSize(18)
        .text(text, 40, y ?? doc.y, { underline: true });
      doc.moveDown(0.5);
    };
    const h2 = (text: string) => {
      doc.font(fontBold).fontSize(14).text(text, 40, doc.y + 8);
      doc.moveDown(0.3);
    };
    const p = (text: string) => {
      doc
        .font(font)
        .fontSize(10)
        .text(text, 40, doc.y, { align: "justify" });
      doc.moveDown(0.2);
    };
    const tableHeader = (headers: string[], widths: number[]) => {
      doc.font(fontBold).fontSize(8);
      let x = 40;
      headers.forEach((header, index) => {
        doc.text(header, x, doc.y, { width: widths[index], align: "left" });
        x += widths[index];
      });
      doc.moveDown(0.3);
    };
    const tableRow = (cells: string[], widths: number[]) => {
      doc.font(font).fontSize(7.5);
      let x = 40;
      const startY = doc.y;
      let maxHeight = 0;

      cells.forEach((cell, index) => {
        const cellHeight = doc.heightOfString(cell, { width: widths[index] });
        if (cellHeight > maxHeight) maxHeight = cellHeight;
        doc.text(cell, x, startY, { width: widths[index], align: "left" });
        x += widths[index];
      });

      doc.y = startY + Math.max(maxHeight, 12);
      if (doc.y > 750) doc.addPage();
    };
    const checkPage = () => {
      if (doc.y > 735) doc.addPage();
    };

    h1("Teacher Analytics Report");
    p(`Group: ${group.name}`);
    p(
      `Generated: ${new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`,
    );
    doc.moveDown(0.5);

    h2("Summary");
    if (groupStats) {
      p(`Total Students: ${groupStats.totalStudents}`);
      p(`Average Score: ${groupStats.avgScoreAllExams.toFixed(1)}%`);
      p(`Pass Rate: ${(groupStats.overallPassRate * 100).toFixed(1)}%`);
    }
    doc.moveDown(0.5);

    h2(`Students (${students.length})`);
    checkPage();
    const studentWidths = [20, 110, 55, 50, 55, 55];
    tableHeader(
      ["#", "Name", "Avg Score", "Attempts", "Completion", "Last Active"],
      studentWidths,
    );

    students.forEach((student, index) => {
      checkPage();
      tableRow(
        [
          `${index + 1}`,
          student.student.name,
          `${student.avgScore.toFixed(1)}%`,
          `${student.totalAttempts}`,
          `${student.completionPercentage.toFixed(1)}%`,
          student.lastActive
            ? new Date(student.lastActive).toLocaleDateString()
            : "-",
        ],
        studentWidths,
      );
    });
    doc.moveDown(0.5);

    h2(`Problems (${problems.length})`);
    checkPage();
    const problemWidths = [18, 95, 50, 55, 45, 50, 45];
    tableHeader(
      ["#", "Title", "Tier", "Success", "Attempted", "Avg Time", "Accepted"],
      problemWidths,
    );

    problems.forEach((problem, index) => {
      checkPage();
      tableRow(
        [
          `${index + 1}`,
          `#${problem.problem.number} ${problem.problem.title}`,
          problem.difficultyTier,
          `${problem.successRate.toFixed(1)}%`,
          `${problem.attemptedCount}/${problem.totalStudents}`,
          `${problem.avgTime.toFixed(0)} min`,
          `${problem.acceptedCount}`,
        ],
        problemWidths,
      );
    });
    doc.moveDown(0.5);

    h2(`Exams (${exams.length})`);
    checkPage();
    const examWidths = [18, 95, 50, 50, 55, 50];
    tableHeader(
      ["#", "Title", "Status", "Avg Score", "Completion", "Students"],
      examWidths,
    );

    exams.forEach((exam, index) => {
      checkPage();
      const analytics = exam.groupExamAnalytics[0];
      tableRow(
        [
          `${index + 1}`,
          exam.title,
          exam.status,
          analytics ? `${analytics.avgScore.toFixed(1)}%` : "-",
          analytics ? `${(analytics.completionRate * 100).toFixed(1)}%` : "-",
          analytics
            ? `${analytics.totalCompleted}/${analytics.totalEnrolled}`
            : "-",
        ],
        examWidths,
      );
    });

    doc.end();
  },
);
