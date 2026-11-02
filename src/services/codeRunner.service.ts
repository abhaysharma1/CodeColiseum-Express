import prisma from "@/infrastructure/database/prisma";
import { fromRuntimeLanguageId } from "@/utils/languageCatalog";
import { executeSubmission, SubmissionExecutionError } from "./codeExecutor.service";
import type { NormalizedTestcase } from "./types";
import {
  AppError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";

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
  /** Authenticated user requesting the run. */
  userId: string;
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

export async function runCodeService({
  questionId,
  languageId,
  code,
}: RunCodeRequest): Promise<RunCodeResponse> {
  const normalizedLanguage = normalizeLanguage(languageId);

  if (!normalizedLanguage) {
    throw new ValidationError("Unsupported language");
  }

  const runTestCase = await prisma.runTestCase.findUnique({
    where: { problemId: questionId },
  });

  if (!runTestCase) {
    throw new NotFoundError("Test cases not found");
  }

  let parsedCases: unknown = runTestCase.cases;
  if (typeof parsedCases === "string") {
    try {
      parsedCases = JSON.parse(parsedCases);
    } catch {
      throw new AppError("Invalid test cases", 500, {
        code: "INTERNAL_SERVER_ERROR",
      });
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
        item && typeof (item as { input?: unknown }).input === "string"
          ? (item as { input: string }).input
          : "";
      const output =
        item && typeof (item as { output?: unknown }).output === "string"
          ? (item as { output: string }).output
          : "";
      return { input, output };
    })
    .filter((testCase) => Boolean(testCase.input) || Boolean(testCase.output));

  if (cases.length === 0) {
    throw new NotFoundError("No test cases available");
  }

  const problem = await prisma.problem.findUnique({
    where: { id: questionId },
  });

  if (!problem) {
    throw new NotFoundError("Problem not found");
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

  let result: Awaited<ReturnType<typeof executeSubmission>>;
  try {
    result = await executeSubmission(
      { language: normalizedLanguage, sourceCode: code },
      normalizedTestcases,
      { header: driver?.header ?? null, footer: driver?.footer ?? null },
    );
  } catch (error) {
    if (
      error instanceof SubmissionExecutionError &&
      error.context?.status === "COMPILE_ERROR"
    ) {
      throw new AppError(error.context.stderr || "Compilation failed", 400, {
        code: "VALIDATION_ERROR",
        cause: error,
      });
    }
    throw error;
  }

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
    cases: result.details.map((d) => ({
      input: d.input,
      output: d.expectedOutput,
    })),
    results,
    passedCount: result.passedCount,
    totalCount: result.totalTestcases,
  };
}
