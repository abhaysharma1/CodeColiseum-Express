import prisma from "../utils/prisma";
import { NextFunction, Request, Response } from "express";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { GLOBAL_ROLE_IDS } from "../permissions/role.constants";
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
import { canAccessModuleProblem } from "@/services/lab.service";

const CASE_START_TOKEN = "_CASE_START_";
const CASE_END_TOKEN = "_CASE_END_";

type NormalizedTestCase = {
  input: string;
  output: string;
};

const stripCaseDelimiters = (value: string) =>
  (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\s*_CASE_START_\s*$/gm, "")
    .replace(/^\s*_CASE_END_\s*$/gm, "")
    .trim();

const parseDelimitedBlocks = (value: string) => {
  if (!value.includes(CASE_START_TOKEN) || !value.includes(CASE_END_TOKEN)) {
    return [];
  }

  const matches = [
    ...value.matchAll(/_CASE_START_\s*([\s\S]*?)\s*_CASE_END_/g),
  ];
  return matches
    .map((match) => stripCaseDelimiters((match[1] ?? "").trim()))
    .filter((block) => block !== "");
};

const parseDelimitedOutputs = (output: string) => {
  return parseDelimitedBlocks(output);
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

export const normalizeProblemTestCases = (rawCases: unknown): NormalizedTestCase[] => {
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

    const inputBlocks = parseDelimitedBlocks(input);
    const outputBlocks = parseDelimitedOutputs(output);

    if (outputBlocks.length === 0) {
      normalized.push({
        input: stripCaseDelimiters(input),
        output: stripCaseDelimiters(output),
      });
      continue;
    }

    const mappedInputBlocks =
      inputBlocks.length > 0
        ? inputBlocks
        : splitBundledInput(stripCaseDelimiters(input), outputBlocks.length);
    const pairCount = outputBlocks.length;

    for (let index = 0; index < pairCount; index += 1) {
      normalized.push({
        input: stripCaseDelimiters(mappedInputBlocks[index] ?? ""),
        output: stripCaseDelimiters(outputBlocks[index] ?? ""),
      });
    }
  }

  return normalized;
};

async function verifyModuleProblemAccess(
  studentId: string,
  moduleProblemId: string,
): Promise<void> {
  const mp = await (prisma as any).moduleProblem.findUnique({
    where: { id: moduleProblemId },
    select: { isUnlocked: true, availableFrom: true, availableUntil: true },
  });
  if (!mp) {
    const err = new Error("Module problem not found");
    (err as any).status = 404;
    throw err;
  }
  const access = canAccessModuleProblem({
    isUnlocked: mp.isUnlocked ?? false,
    availableFrom: mp.availableFrom ?? null,
    availableUntil: mp.availableUntil ?? null,
  });
  if (!access.allowed) {
    const messages: Record<string, string> = {
      LOCKED: "Problem is currently locked",
      NOT_YET_AVAILABLE: "Problem is not yet available",
      EXPIRED: "Problem access window has expired",
    };
    const err = new Error(messages[access.reason!] || "Problem not accessible");
    (err as any).status = 403;
    throw err;
  }
}

export const getProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Optional auth: show hidden problems to teachers/admins
    let isTeacherOrAdmin = false;
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      const role = session?.user?.globalRoleId;
      isTeacherOrAdmin =
        role === GLOBAL_ROLE_IDS.ORG_TEACHER ||
        role === GLOBAL_ROLE_IDS.PLATFORM_ADMIN;
    } catch {
      // No session — treat as public user
    }

    const { searchValue, tags, difficulty, take, skip, withDescription } =
      req.query;

    const includeDescription =
      withDescription === undefined
        ? true
        : String(withDescription).toLowerCase() !== "false";

    const where: any = {
      number: {
        not: 0,
      },
    };

    // Hide hidden problems from non-teacher/non-admin users
    if (!isTeacherOrAdmin) {
      where.hidden = false;
    }

    // Add search conditions
    if (searchValue && String(searchValue).trim() !== "") {
      const search = String(searchValue).trim();
      const parsedNumber = Number(search);

      const orConditions: any[] = [
        { title: { contains: search, mode: "insensitive" } },
        { id: search },
      ];

      if (includeDescription) {
        orConditions.push({
          description: {
            contains: search,
            mode: "insensitive",
          },
        });
      }

      // Search by problem number if searchValue is a valid number
      if (!Number.isNaN(parsedNumber)) {
        orConditions.push({
          number: parsedNumber,
        });
      }

      where.OR = orConditions;
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
      select: {
        id: true,
        number: true,
        title: true,
        description: includeDescription,
        difficulty: true,
        tags: {
          select: {
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

    let template = await prisma.driverCode.findUnique({
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

    if (!template) {
      template = await prisma.driverCode.findUnique({
        where: {
          language_problemId: {
            language: resolvedLanguage,
            problemId: "1dc71649-3a7e-4e20-be71-32a7da08388e",
          },
        },
        select: {
          template: true,
          language: true,
          header: false,
          footer: false,
        },
      });
    }

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
    const { questionId, language, languageId, code, moduleProblemId } = req.body;
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

    if (moduleProblemId && req.user?.id) {
      await verifyModuleProblemAccess(req.user.id, moduleProblemId);
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
    const { questionId, language, languageId, code, moduleProblemId } = req.body;
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

    if (moduleProblemId && req.user?.id) {
      await verifyModuleProblemAccess(req.user.id, moduleProblemId);
    }

    const requestData: SubmitCodeRequest = {
      questionId,
      languageId: resolvedLanguageId,
      code,
      moduleProblemId,
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
    const moduleProblemId = req.query.moduleProblemId as string | undefined;

    if (!submissionId) {
      const error = new Error("submissionId is required");
      (error as any).status = 400;
      return next(error);
    }

    const result = await getPracticeSubmissionStatusService(
      req,
      submissionId,
      moduleProblemId,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
