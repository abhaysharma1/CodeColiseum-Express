import { Request, Response, NextFunction } from "express";
import prisma from "../utils/prisma";
import {
  canGiveExam,
  validateAttempt,
  verifySEB,
  SEBError,
} from "../utils/exam.utils";
import {
  submitCodeService,
  SubmitCodeRequest,
} from "../services/codeSubmission.service";

// Controller for fetching exam problems
export const getTestProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { examId } = req.body;

  if (!examId) {
    const error = new Error("Exam ID is required");
    (error as any).status = 400;
    return next(error);
  }

  try {
    const examDetails = await prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!examDetails) {
      const error = new Error("Exam Not Found");
      (error as any).status = 404;
      return next(error);
    }

    const session = await canGiveExam(examDetails, req);
    await validateAttempt(examDetails.id, session.user.id);

    const examProblems = await prisma.examProblem.findMany({
      where: {
        examId: examDetails.id,
      },
    });

    if (!examProblems || examProblems.length === 0) {
      const error = new Error("No Exam Problems Found");
      (error as any).status = 404;
      return next(error);
    }

    res.status(200).json(examProblems);
  } catch (error) {
    next(error);
  }
};

// Controller for heartbeat updates
export const heartbeat = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Use existing auth middleware to ensure user is authenticated
    if (!req.user) {
      const error = new Error("Unauthorized");
      (error as any).status = 401;
      return next(error);
    }

    await prisma.examAttempt.updateMany({
      where: {
        studentId: req.user.id,
        status: "IN_PROGRESS",
      },
      data: {
        lastHeartbeatAt: new Date(),
      },
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
};

// Controller for fetching problem description
export const getProblemDescription = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { problemId } = req.query;

  try {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId as string },
    });

    if (!problem) {
      const error = new Error("Problem not found");
      (error as any).status = 404;
      return next(error);
    }

    res.status(200).json(problem);
  } catch (error) {
    next(error);
  }
};

// Controller for fetching submissions
export const getSubmissions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { attemptId, problemId } = req.query;

  if (!attemptId || !problemId) {
    const error = new Error("attemptId and problemId are required");
    (error as any).status = 400;
    return next(error);
  }

  try {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId as string },
    });

    if (!attempt) {
      const error = new Error("Exam attempt not found");
      (error as any).status = 404;
      return next(error);
    }

    const submissions = await prisma.submission.findMany({
      where: { attemptId: attemptId as string, problemId: problemId as string },
    });

    res.status(200).json({ submissions });
  } catch (error) {
    next(error);
  }
};

// Controller for fetching test cases
export const getTestCases = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { questionId } = req.query;

  if (!questionId) {
    const error = new Error("questionId is required");
    (error as any).status = 400;
    return next(error);
  }

  try {
    const testCases = await prisma.runTestCase.findFirst({
      where: { problemId: questionId as string },
    });

    if (!testCases) {
      const error = new Error("Test cases not found");
      (error as any).status = 404;
      return next(error);
    }

    res.status(200).json(testCases);
  } catch (error) {
    next(error);
  }
};

// Controller for fetching exam details
export const getExamDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { examId } = req.query;

  try {
    const examDetails = await prisma.exam.findUnique({
      where: { id: examId as string },
    });

    if (!examDetails) {
      const error = new Error("Exam not found");
      (error as any).status = 404;
      return next(error);
    }

    res.status(200).json(examDetails);
  } catch (error) {
    next(error);
  }
};

// Controller for starting a test
export const startTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { examId } = req.body;

    if (!examId) {
      const error = new Error("Exam ID is required");
      (error as any).status = 400;
      return next(error);
    }

    const now = new Date();

    const examDetails = await prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!examDetails) {
      const error = new Error("Exam Not Found");
      (error as any).status = 404;
      return next(error);
    }

    if (examDetails.sebEnabled) {
      verifySEB(req);
    }

    const session = await canGiveExam(examDetails, req);

    const expiresAt = new Date(
      now.getTime() + examDetails.durationMin * 60 * 1000,
    );

    const newAttempt = await prisma.examAttempt.upsert({
      where: {
        examId_studentId: {
          examId: examDetails.id,
          studentId: session.user.id,
        },
      },
      update: {
        lastHeartbeatAt: new Date(),
      },
      create: {
        examId: examDetails.id,
        studentId: session.user.id,
        status: "IN_PROGRESS",
        lastHeartbeatAt: new Date(),
        startedAt: new Date(),
        expiresAt,
      },
    });

    res.status(201).json(newAttempt);
  } catch (error) {
    next(error);
  }
};

// Controller for submitting code
export const submitCode = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { examId, problemId, sourceCode, languageId } = req.body;

    const requestData: SubmitCodeRequest = {
      examId,
      problemId,
      sourceCode,
      languageId,
    };

    const result = await submitCodeService(req, requestData);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Controller for submitting a test
export const submitTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { examId } = req.body;

    if (!examId) {
      const error = new Error("Exam ID is required");
      (error as any).status = 400;
      return next(error);
    }

    const examDetails = await prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!examDetails) {
      const error = new Error("Exam not found");
      (error as any).status = 404;
      return next(error);
    }

    if (examDetails.sebEnabled) {
      verifySEB(req);
    }

    const session = await canGiveExam(examDetails, req);
    await validateAttempt(examDetails.id, session.user.id);

    // Get all submissions for this exam attempt
    const submissions = await prisma.submission.findMany({
      where: {
        userId: session.user.id,
        examId: examDetails.id,
      },
    });

    // Calculate scores per problem (take the maximum score for each problem)
    const scoreMap = new Map<string, number>();

    for (const s of submissions) {
      const prev = scoreMap.get(s.problemId) ?? 0;
      const prevScore =
        s.totalTestcases > 0
          ? Math.round((s.passedTestcases / s.totalTestcases) * 100)
          : 0;
      scoreMap.set(s.problemId, Math.max(prevScore, prev));
    }

    const finalScore = Array.from(scoreMap.values()).reduce((a, b) => a + b, 0);

    // Update the exam attempt to submitted status
    const attempt = await prisma.examAttempt.update({
      where: {
        examId_studentId: {
          examId: examDetails.id,
          studentId: session.user.id,
        },
      },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        totalScore: finalScore,
      },
    });

    // Create exam result record
    const result = await prisma.examResult.create({
      data: {
        score: finalScore,
        examId: examDetails.id,
        userId: session.user.id,
      },
    });

    res.status(200).json({
      success: true,
      attemptId: attempt.id,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      totalScore: finalScore,
    });
  } catch (error) {
    next(error);
  }
};
