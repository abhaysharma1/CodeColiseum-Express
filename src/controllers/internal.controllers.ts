import "dotenv/config";
import { NextFunction, Request, Response } from "express";
import prisma from "../utils/prisma";
import { ExamStatus, ExamAttemptStatus } from "../../generated/prisma/enums";

export async function finalizeExams(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const now = new Date();

    // 1. Find all exams that have ended but are not yet completed/finished
    const expiredExams = await prisma.exam.findMany({
      where: {
        endDate: { lt: now },
        status: {
          notIn: [ExamStatus.completed, ExamStatus.finished, ExamStatus.ai_processing],
        },
      },
      include: {
        examGroups: true,
        problems: true,
      },
    });

    if (expiredExams.length === 0) {
      return res.status(200).json({ message: "No exams to finalize" });
    }

    const finalizedExamIds: string[] = [];

    for (const exam of expiredExams) {
      // 2. Find all IN_PROGRESS attempts for this exam
      const activeAttempts = await prisma.examAttempt.findMany({
        where: {
          examId: exam.id,
          status: ExamAttemptStatus.IN_PROGRESS,
        },
      });

      // 3. Auto-submit each active attempt
      for (const attempt of activeAttempts) {
        // Get best (isFinal) submission per problem for this attempt
        const finalSubmissions = await prisma.submission.findMany({
          where: {
            attemptId: attempt.id,
            isFinal: true,
          },
        });

        // Calculate total score:
        // Each problem contributes (passedTestcases / totalTestcases) * 100
        // averaged across all problems in the exam
        const problemCount = exam.problems.length;
        let totalScore = 0;

        if (problemCount > 0) {
          for (const sub of finalSubmissions) {
            const problemScore =
              sub.totalTestcases > 0
                ? Math.round((sub.passedTestcases / sub.totalTestcases) * 100)
                : 0;
            totalScore += problemScore;
          }
          // Average across all exam problems (unsolved = 0)
          totalScore = Math.round(totalScore / problemCount);
        }

        // Create ExamResult
        await prisma.examResult.create({
          data: {
            examId: exam.id,
            userId: attempt.studentId,
            score: totalScore,
          },
        });

        // Mark attempt as AUTO_SUBMITTED
        await prisma.examAttempt.update({
          where: { id: attempt.id },
          data: {
            status: ExamAttemptStatus.AUTO_SUBMITTED,
            submittedAt: now,
            totalScore,
          },
        });
      }

      // 4. Mark exam as completed
      await prisma.exam.update({
        where: { id: exam.id },
        data: { status: ExamStatus.completed },
      });

      // 5. Update stats for each group linked to this exam
      for (const examGroup of exam.examGroups) {
        const groupId = examGroup.groupId;

        // Fetch all ExamResults for all exams ever linked to this group
        const allGroupExamIds = await prisma.examGroup.findMany({
          where: { groupId },
          select: { examId: true },
        });

        const allExamIds = allGroupExamIds.map((eg) => eg.examId);

        const allResults = await prisma.examResult.findMany({
          where: { examId: { in: allExamIds } },
          select: { userId: true, examId: true, score: true },
        });

        // totalExams = distinct exams that have at least one result in this group
        const distinctExamIds = [...new Set(allResults.map((r) => r.examId))];
        const totalExams = distinctExamIds.length;

        // totalStudents = group member count
        const totalStudents = await prisma.groupMember.count({
          where: { groupId },
        });

        // avgScoreAllExams = average of all scores across all results in group
        const avgScoreAllExams =
          allResults.length > 0
            ? allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length
            : 0;

        // Per-exam averages for highestExamAvg / lowestExamAvg
        const examAvgMap: Record<string, number> = {};
        for (const examId of distinctExamIds) {
          const examResults = allResults.filter((r) => r.examId === examId);
          examAvgMap[examId] =
            examResults.reduce((sum, r) => sum + r.score, 0) / examResults.length;
        }

        const examAvgs = Object.values(examAvgMap);
        const highestExamAvg = examAvgs.length > 0 ? Math.max(...examAvgs) : 0;
        const lowestExamAvg = examAvgs.length > 0 ? Math.min(...examAvgs) : 0;

        // overallPassRate = students who scored >= 50 / totalStudents
        const passScore = 50;
        const studentBestScore: Record<string, number> = {};
        for (const r of allResults) {
          if (!studentBestScore[r.userId] || r.score > studentBestScore[r.userId]) {
            studentBestScore[r.userId] = r.score;
          }
        }
        const passedStudents = Object.values(studentBestScore).filter(
          (s) => s >= passScore,
        ).length;
        const overallPassRate =
          totalStudents > 0 ? passedStudents / totalStudents : 0;

        // Upsert GroupOverallStats
        await prisma.groupOverallStats.upsert({
          where: { groupId },
          create: {
            groupId,
            totalExams,
            totalStudents,
            avgScoreAllExams,
            overallPassRate,
            highestExamAvg,
            lowestExamAvg,
          },
          update: {
            totalExams,
            totalStudents,
            avgScoreAllExams,
            overallPassRate,
            highestExamAvg,
            lowestExamAvg,
          },
        });

        // 6. Update StudentOverallStats for each student in this group
        const groupMembers = await prisma.groupMember.findMany({
          where: { groupId },
          select: { studentId: true },
        });

        for (const member of groupMembers) {
          const studentResults = allResults.filter(
            (r) => r.userId === member.studentId,
          );

          const studentTotalExams = [
            ...new Set(studentResults.map((r) => r.examId)),
          ].length;

          const studentTotalScore = studentResults.reduce(
            (sum, r) => sum + r.score,
            0,
          );

          const studentAvgScore =
            studentTotalExams > 0 ? studentTotalScore / studentTotalExams : 0;

          await prisma.studentOverallStats.upsert({
            where: {
              groupId_studentId: {
                groupId,
                studentId: member.studentId,
              },
            },
            create: {
              groupId,
              studentId: member.studentId,
              totalScore: studentTotalScore,
              totalExams: studentTotalExams,
              avgScore: studentAvgScore,
              totalAttempts: 0, // already tracked per submission
            },
            update: {
              totalScore: studentTotalScore,
              totalExams: studentTotalExams,
              avgScore: studentAvgScore,
            },
          });
        }
      }

      finalizedExamIds.push(exam.id);
    }

    return res.status(200).json({
      message: `Finalized ${finalizedExamIds.length} exam(s)`,
      finalizedExamIds,
    });
  } catch (error) {
    next(error);
  }
}