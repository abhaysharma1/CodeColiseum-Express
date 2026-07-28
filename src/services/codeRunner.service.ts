import { Request } from "express";
import prisma from "../utils/prisma";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { fromRuntimeLanguageId, type LanguageKey } from "@/utils/languageCatalog";
import { executeSubmission, SubmissionExecutionError } from "./codeExecutor.service";
import type { NormalizedTestcase } from "./types";

/* ----------------------------- Types ----------------------------- */

interface TestCase {
  input: string;
  output: string;
}

interface PistonStage {
  stdout: string;
  stderr: string;
  output: string;
  code: number | null;
  signal: string | null;
}

interface PistonExecutionResult {
  language: string;
  version: string;
  run: PistonStage;
  compile?: PistonStage;
}

interface RunCaseResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
}

const normalizeLanguage = (languageId?: number) =>
  fromRuntimeLanguageId(languageId);

/* ----------------------------- Interfaces ----------------------------- */

export interface RunCodeRequest {
  questionId: string;
  languageId?: number;
  code: string;
}

export interface RunCodeResponse {
  responses: PistonExecutionResult[];
  cases: TestCase[];
  results: RunCaseResult[];
  passedCount: number;
  totalCount: number;
}

/* ----------------------------- Service ----------------------------- */

export async function runCodeService(
  req: Request,
  { questionId, languageId, code }: RunCodeRequest,
): Promise<RunCodeResponse> {
  const normalizedLanguage = normalizeLanguage(languageId);

  if (!normalizedLanguage) {
    const error = new Error("Unsupported language");
    (error as any).status = 400;
    throw error;
  }

  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session?.user?.id) {
    const error = new Error("Login required");
    (error as any).status = 401;
    throw error;
  }

  const runTestCase = await prisma.runTestCase.findUnique({
    where: { problemId: questionId },
  });

  if (!runTestCase) {
    const error = new Error("Test cases not found");
    (error as any).status = 404;
    throw error;
  }

  let parsedCases: unknown = runTestCase.cases;
  if (typeof parsedCases === "string") {
    try {
      parsedCases = JSON.parse(parsedCases);
    } catch {
      const error = new Error("Invalid test cases");
      (error as any).status = 500;
      throw error;
    }
  }

  const rawCases = Array.isArray(parsedCases)
    ? parsedCases
    : parsedCases && typeof parsedCases === "object"
      ? [parsedCases]
      : [];

  const cases: TestCase[] = rawCases
    .map((item) => {
      const input =
        item && typeof (item as any).input === "string" ? (item as any).input : "";
      const output =
        item && typeof (item as any).output === "string"
          ? (item as any).output
          : "";
      return { input, output };
    })
    .filter((testCase) => Boolean(testCase.input) || Boolean(testCase.output));

  if (cases.length === 0) {
    const error = new Error("No test cases available");
    (error as any).status = 404;
    throw error;
  }

  const problem = await prisma.problem.findUnique({
    where: { id: questionId },
  });

  if (!problem) {
    const error = new Error("Problem not found");
    (error as any).status = 404;
    throw error;
  }

  const driver = await prisma.driverCode.findUnique({
    where: {
      language_problemId: {
        language: normalizedLanguage,
        problemId: problem.id,
      },
    },
  });

  const normalizedTestcases: NormalizedTestcase[] = cases.map((tc, idx) => ({
    testcaseId: `tc-${idx + 1}`,
    input: tc.input,
    expectedOutput: tc.output,
  }));

  const result = await executeSubmission(
    { language: normalizedLanguage, sourceCode: code },
    normalizedTestcases,
    { header: driver?.header ?? null, footer: driver?.footer ?? null },
  );

  const responses: PistonExecutionResult[] = result.details.map((d) => ({
    language: normalizedLanguage,
    version: "*",
    run: {
      stdout: d.stdout,
      stderr: d.stderr ?? "",
      output: d.stdout,
      code: d.passed ? 0 : 1,
      signal: null,
    },
  }));

  const results: RunCaseResult[] = result.details.map((d) => ({
    input: d.stdout,
    expectedOutput: d.expectedOutput,
    actualOutput: d.stdout,
    passed: d.passed,
  }));

  return {
    responses,
    cases: cases.map((tc) => ({
      input: tc.input,
      output: tc.output,
    })),
    results,
    passedCount: result.passedCount,
    totalCount: result.totalTestcases,
  };
}
