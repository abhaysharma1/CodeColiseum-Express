import prisma from "../utils/prisma";
import { NextFunction, Request, Response } from "express";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { runCodeService, RunCodeRequest } from "../services/codeRunner.service";
import {
  submitCodeService,
  SubmitCodeRequest,
} from "../services/problemSubmission.service";
import { enqueuePracticeAIReview } from "@/services/startAiEvaluation.service";
import { redis } from "@/config/upstashRedis.config";

export const getProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { searchValue, tags, difficulty, take, skip } = req.query;

    const where: any = {};

    // Add search conditions
    if (searchValue && String(searchValue).trim() !== "") {
      where.OR = [
        { title: { contains: String(searchValue), mode: "insensitive" } },
        { description: { contains: String(searchValue), mode: "insensitive" } },
        { id: String(searchValue) },
      ];
    }

    // Add tag filter
    if (tags) {
      where.tags = {
        some: { name: String(tags) },
      };
    }

    // Add difficulty filter
    if (difficulty) {
      where.difficulty = String(difficulty);
    }

    // Fetch problems from the database
    const problems = await prisma.problem.findMany({
      where,
      take: take ? parseInt(String(take), 10) : 10,
      skip: skip ? parseInt(String(skip), 10) : 0,
      orderBy: { number: "asc" },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    return res.status(200).json(problems);
  } catch (error) {
    next(error);
  }
};

export const getProblemTags = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await prisma.tag.findMany({});
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

// Controller for fetching problem test cases
export const getProblemTestCases = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.query;

    if (!id) {
      const error = new Error("Question ID is required");
      (error as any).status = 400;
      return next(error);
    }

    const questionCases = await prisma.runTestCase.findFirst({
      where: {
        problemId: id as string,
      },
    });

    if (!questionCases) {
      const error = new Error("Test cases not found");
      (error as any).status = 404;
      return next(error);
    }

    res.status(200).json(questionCases);
  } catch (error) {
    next(error);
  }
};

// Controller for fetching user's problem submissions
export const getSubmissions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Get the current user session
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      const error = new Error("Not authenticated");
      (error as any).status = 401;
      return next(error);
    }

    const userId = session.user.id;
    const { problemId } = req.body;

    if (!problemId) {
      const error = new Error("problemId is required");
      (error as any).status = 400;
      return next(error);
    }

    // Verify that the problem exists
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) {
      const error = new Error("Problem not found");
      (error as any).status = 404;
      return next(error);
    }

    const submissions = await prisma.selfSubmission.findMany({
      where: {
        problemId,
        userId,
      },
      select: {
        id: true,
        language: true,
        createdAt: true,
        noOfPassedCases: true,
        code: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({ submissions });
  } catch (error) {
    next(error);
  }
};

// Controller for fetching template code
export const getTemplateCode = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { problemId, languageId } = req.body;

    if (!problemId || !languageId) {
      const error = new Error("problemId and languageId are required");
      (error as any).status = 400;
      return next(error);
    }

    const problem = await prisma.problem.findUnique({
      where: {
        id: problemId,
      },
    });

    if (!problem) {
      const error = new Error("Couldn't find Problem");
      (error as any).status = 404;
      return next(error);
    }

    const template = await prisma.driverCode.findUnique({
      where: {
        languageId_problemId: {
          languageId: languageId,
          problemId: problemId,
        },
      },
      select: {
        template: true,
        languageId: true,
        header: false,
        footer: false,
      },
    });

    res.status(200).json(template);
  } catch (error) {
    next(error);
  }
};

// Controller for running code against test cases
export const runCode = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { questionId, languageId, code } = req.body;

    if (!questionId || !languageId || !code) {
      const error = new Error("questionId, languageId, and code are required");
      (error as any).status = 400;
      return next(error);
    }

    const requestData: RunCodeRequest = {
      questionId,
      languageId,
      code,
    };

    const result = await runCodeService(req, requestData);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Controller for submitting code solution
export const submitCode = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { questionId, languageId, code } = req.body;

    if (!questionId || !languageId || !code) {
      const error = new Error("questionId, languageId, and code are required");
      (error as any).status = 400;
      return next(error);
    }

    const requestData: SubmitCodeRequest = {
      questionId,
      languageId,
      code,
    };

    const result = await submitCodeService(req, requestData);
    const statusCode = result.status === "ACCEPTED" ? 201 : 200;
    res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
};
