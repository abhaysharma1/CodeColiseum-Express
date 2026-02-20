import { ExamResultResponse } from "@/types/data";
import prisma from "@/utils/prisma";
import { NextFunction, Request, Response } from "express";
import { Exam, ExamProblem, Submission } from "generated/prisma/client";
import { ExamAttemptStatus } from "generated/prisma/enums";

export async function getDashboardData(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user;
    const nowDate = new Date();

    // groups
    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: {
            studentId: user.id,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    //upcoming and ongoing exams
    const exams = await prisma.exam.findMany({
      where: {
        examGroups: {
          some: {
            group: {
              members: {
                some: {
                  studentId: user.id,
                },
              },
            },
          },
        },
        isPublished: true,
        endDate: { gte: nowDate },
      },
    });

    const upcomingExams = exams.filter((item) => item.startDate > nowDate);
    const ongoingExams = exams.filter(
      (item) => item.endDate > nowDate && item.startDate < nowDate,
    );

    // get Previous exam Results
    const prevResults = await prisma.examResult.findMany({
      where: {
        userId: user.id,
      },
      take: 10,
    });

    // questions solved by themselves count
    const problemsSolved = await prisma.selfSubmission.findMany({
      where: {
        userId: user.id,
        status: "ACCEPTED",
      },
      include: {
        problem: {
          select: {
            difficulty: true,
          },
        },
      },
      distinct: ["problemId"],
    });

    const totalNoOfQuestions = await prisma.problem.count();

    const totalSolvedProblems = problemsSolved.length;

    const easyProblemSolved = problemsSolved.filter(
      (item) => item.problem.difficulty == "EASY",
    ).length;
    const mediumProblemSolved = problemsSolved.filter(
      (item) => item.problem.difficulty == "MEDIUM",
    ).length;
    const hardProblemSolved = problemsSolved.filter(
      (item) => item.problem.difficulty == "HARD",
    ).length;

    const finalDashboardData = {
      groups,
      exams: { upcomingExams, ongoingExams },
      prevResults,
      problemDetails: {
        totalSolvedProblems,
        easyProblemSolved,
        mediumProblemSolved,
        hardProblemSolved,
        totalNoOfQuestions,
      },
    };
    return res.status(200).json(finalDashboardData);
  } catch (error) {
    next(error);
  }
}

export async function getExamResult(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user;
    const { examId } = req.query;

    if (!examId) {
      return res.status(400).json({ error: "examId is required" });
    }

    const examDetails = (await prisma.exam.findUnique({
      where: { id: String(examId) },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        problems: {
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
          orderBy: {
            order: "asc",
          },
        },
      },
    })) as unknown as Exam & {
      creator: { id: string; name: string; email: string };
      problems: (ExamProblem & {
        problem: {
          id: string;
          number: number;
          title: string;
          difficulty: string;
        };
      })[];
    };

    if (!examDetails) {
      return res.status(404).json({ error: "Exam not found" });
    }

    const examAttempt = await prisma.examAttempt.findUnique({
      where: {
        examId_studentId: {
          examId: String(examId),
          studentId: user.id,
        },
      },
    });

    if (!examAttempt) {
      return res.status(404).json({ error: "Exam attempt not found" });
    }

    const finalScore = examAttempt.totalScore;

    // Fetch ONLY the final submissions for this attempt
    const finalSubmissions = await prisma.submission.findMany({
      where: {
        attemptId: examAttempt.id,
        isFinal: true,
      },
      orderBy: {
        createdAt: "desc", // If multiple exist (accidentally), take the latest
      },
    });

    // Create a map to handle distinct problem IDs (just in case there are duplicates)
    const distinctSubmissionsMap = new Map<string, Submission>();

    finalSubmissions.forEach((sub) => {
      if (!distinctSubmissionsMap.has(sub.problemId)) {
        distinctSubmissionsMap.set(sub.problemId, sub);
      }
    });

    // Generate the report
    const submissionReports = Array.from(distinctSubmissionsMap.values()).map(
      (reportSubmission) => ({
        problemId: reportSubmission.problemId,
        submissionId: reportSubmission.id,
        code: reportSubmission.sourceCode,
        language: reportSubmission.language,
        passedTestcases: reportSubmission.passedTestcases,
        totalTestcases: reportSubmission.totalTestcases,
        executionTime: reportSubmission.executionTime,
        memory: reportSubmission.memory,
        createdAt: reportSubmission.createdAt,
        isSuccessful:
          reportSubmission.passedTestcases === reportSubmission.totalTestcases,
        status: reportSubmission.status,
      }),
    );

    // 5. Get Ranking
    const allAttempts = await prisma.examAttempt.findMany({
      where: {
        examId: String(examId),
        status: {
          in: [
            "SUBMITTED" as ExamAttemptStatus,
            "AUTO_SUBMITTED" as ExamAttemptStatus,
          ],
        },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { totalScore: "desc" },
        { submittedAt: "asc" }, // Earlier submission as tiebreaker
      ],
    });

    const ranking = allAttempts.map((attempt: any, index: number) => ({
      rank: index + 1,
      studentId: attempt.studentId,
      studentName: attempt.student.name,
      studentEmail: attempt.student.email,
      totalScore: attempt.totalScore,
      submittedAt: attempt.submittedAt,
    }));

    const currentStudentRanking = ranking.find(
      (rank: (typeof ranking)[0]) => rank.studentId === user.id,
    );

    // Return all the requested data
    return res.status(200).json({
      examDetails: {
        id: examDetails.id,
        title: examDetails.title,
        examStatus: examDetails.status,
        description: examDetails.description,
        durationMin: examDetails.durationMin,
        startDate: examDetails.startDate,
        endDate: examDetails.endDate,
        creator: examDetails.creator,
        problems: examDetails.problems.map(
          (ep: (typeof examDetails.problems)[0]) => ({
            order: ep.order,
            problem: ep.problem,
          }),
        ),
      },
      examAttempt: {
        id: examAttempt.id,
        status: examAttempt.status,
        startedAt: examAttempt.startedAt,
        expiresAt: examAttempt.expiresAt,
        submittedAt: examAttempt.submittedAt,
        totalScore: examAttempt.totalScore,
      },
      finalScore,
      submissionReports,
      ranking: {
        currentStudent: currentStudentRanking,
        allRankings: ranking,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getExamAIResult(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user;
    const { examId } = req.query;

    if (!examId) {
      return res.status(400).json({ error: "examId is required" });
    }

    const exam = await prisma.exam.findUnique({
      where: {
        id: String(examId),
      },
    });

    if (!exam) {
      return res.status(404).json({ error: "Exam Not Found" });
    }

    const aiEvaluation = await prisma.aiEvaluation.findMany({
      where: {
        submission: {
          examId: exam.id,
          userId: user.id,
        },
      },
      include: {
        submission: {
          include: {
            problem: true,
          },
        },
      },
    });

    if (aiEvaluation.length === 0) {
      return res.status(404).json({ error: "Couldn't Find AI Submission" });
    }

    return res.status(200).json(aiEvaluation);
  } catch (error) {
    next(error);
  }
}


