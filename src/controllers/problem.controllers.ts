import prisma from "../utils/prisma";
import { NextFunction, Request, Response } from "express";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { runCodeService, RunCodeRequest } from "../services/codeRunner.service";
import {
  getPracticeSubmissionStatusService,
  submitCodeService,
  SubmitCodeRequest,
} from "../services/problemSubmission.service";
import { enqueuePracticeAIReview } from "@/services/startAiEvaluation.service";
import {
  resolveLanguageId,
  resolveLanguageFromInput,
} from "@/utils/languageCatalog";

const CASE_START_TOKEN = "_CASE_START_";
const CASE_END_TOKEN = "_CASE_END_";

type NormalizedTestCase = {
  input: string;
  output: string;
};

const parseDelimitedOutputs = (output: string) => {
  if (!output.includes(CASE_START_TOKEN) || !output.includes(CASE_END_TOKEN)) {
    return [];
  }

  const matches = [...output.matchAll(/_CASE_START_\s*([\s\S]*?)\s*_CASE_END_/g)];
  return matches
    .map((match) => (match[1] ?? "").trim())
    .filter((value) => value !== "");
};

const splitBundledInput = (input: string, expectedCases: number) => {
  if (expectedCases <= 1) {
    return [input.trim()];
  }

  const lines = input.split(/\r?\n/).map((line) => line.trimEnd());
  const firstLine = lines[0]?.trim() ?? "";
  const declaredCount = Number.parseInt(firstLine, 10);
  const hasLeadingCount =
    Number.isFinite(declaredCount) && declaredCount === expectedCases;

  const inputLines = hasLeadingCount ? lines.slice(1) : lines;
  if (inputLines.length === 0) {
    return Array.from({ length: expectedCases }, () => "");
  }

  if (inputLines.length % expectedCases === 0) {
    const linesPerCase = inputLines.length / expectedCases;
    return Array.from({ length: expectedCases }, (_, index) => {
      const start = index * linesPerCase;
      const end = start + linesPerCase;
      return inputLines.slice(start, end).join("\n").trim();
    });
  }

  return Array.from({ length: expectedCases }, (_, index) =>
    (inputLines[index] ?? "").trim(),
  );
};

const normalizeProblemTestCases = (rawCases: unknown): NormalizedTestCase[] => {
  let parsedCases = rawCases;

  if (typeof parsedCases === "string") {
    try {
      parsedCases = JSON.parse(parsedCases);
    } catch {
      return [];
    }
  }

  const sourceCases = Array.isArray(parsedCases)
    ? parsedCases
    : parsedCases && typeof parsedCases === "object"
      ? [parsedCases]
      : [];

  const normalized: NormalizedTestCase[] = [];

  for (const caseItem of sourceCases) {
    if (!caseItem || typeof caseItem !== "object") {
      continue;
    }

    const input =
      typeof (caseItem as { input?: unknown }).input === "string"
        ? ((caseItem as { input: string }).input ?? "")
        : "";
    const output =
      typeof (caseItem as { output?: unknown }).output === "string"
        ? ((caseItem as { output: string }).output ?? "")
        : "";

    if (!input && !output) {
      continue;
    }

    const outputBlocks = parseDelimitedOutputs(output);
    if (outputBlocks.length <= 1) {
      normalized.push({
        input: input.trim(),
        output: output.trim(),
      });
      continue;
    }

    const inputBlocks = splitBundledInput(input, outputBlocks.length);
    const pairCount = Math.min(inputBlocks.length, outputBlocks.length);

    for (let index = 0; index < pairCount; index += 1) {
      normalized.push({
        input: (inputBlocks[index] ?? "").trim(),
        output: (outputBlocks[index] ?? "").trim(),
      });
    }
  }

  return normalized;
};

export const getProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { searchValue, tags, difficulty, take, skip, withDescription } =
      req.query;

    const where: any = {};

    // Add search conditions
    if (searchValue && String(searchValue).trim() !== "") {
      if (withDescription) {
        where.OR = [
          { title: { contains: String(searchValue), mode: "insensitive" } },
          {
            description: { contains: String(searchValue), mode: "insensitive" },
          },
          { id: String(searchValue) },
        ];
      } else if (!withDescription || withDescription !== undefined) {
        where.OR = [
          { title: { contains: String(searchValue), mode: "insensitive" } },
          { id: String(searchValue) },
        ];
      }
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

    const normalizedCases = normalizeProblemTestCases(questionCases.cases);

    res.status(200).json({
      ...questionCases,
      cases: normalizedCases,
    });
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
        passedTestcases: true,
        sourceCode: true,
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
    const { problemId, language, languageId } = req.body;
    const resolvedLanguage = resolveLanguageFromInput({ language, languageId });

    if (!problemId) {
      const error = new Error("problemId is required");
      (error as any).status = 400;
      return next(error);
    }

    if (!resolvedLanguage) {
      const error = new Error("Unsupported language");
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
        language_problemId: {
          language: resolvedLanguage,
          problemId: problemId,
        },
      },
      select: {
        template: true,
        language: true,
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
    const { questionId, language, languageId, code } = req.body;
    const resolvedLanguageId = resolveLanguageId({
      language,
      languageId,
    });

    if (!questionId || !code) {
      const error = new Error("questionId and code are required");
      (error as any).status = 400;
      return next(error);
    }

    if (!resolvedLanguageId) {
      const error = new Error("Unsupported language");
      (error as any).status = 400;
      return next(error);
    }

    const requestData: RunCodeRequest = {
      questionId,
      languageId: resolvedLanguageId,
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
    const { questionId, language, languageId, code } = req.body;
    const resolvedLanguageId = resolveLanguageId({
      language,
      languageId,
    });

    if (!questionId || !code) {
      const error = new Error("questionId and code are required");
      (error as any).status = 400;
      return next(error);
    }

    if (!resolvedLanguageId) {
      const error = new Error("Unsupported language");
      (error as any).status = 400;
      return next(error);
    }

    const requestData: SubmitCodeRequest = {
      questionId,
      languageId: resolvedLanguageId,
      code,
    };

    const result = await submitCodeService(req, requestData);
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
};

export const getSubmissionStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawSubmissionId = req.params.submissionId;
    const submissionId = Array.isArray(rawSubmissionId)
      ? rawSubmissionId[0]
      : rawSubmissionId;

    if (!submissionId) {
      const error = new Error("submissionId is required");
      (error as any).status = 400;
      return next(error);
    }

    const result = await getPracticeSubmissionStatusService(req, submissionId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
