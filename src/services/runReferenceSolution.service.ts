import { fromRuntimeLanguageId } from "@/utils/languageCatalog";
import { executeSubmission } from "./codeExecutor.service";
import type { NormalizedTestcase } from "./types";
import { NotFoundError, ValidationError } from "@/shared/errors";

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

export interface RunRawCodeRequest {
  languageId?: number;
  code: string;
  cases: TestCase[];
}

export interface RunRawCodeResponse {
  responses: PistonExecutionResult[];
  cases: TestCase[];
  results: RunCaseResult[];
  passedCount: number;
  totalCount: number;
}

/* ----------------------------- Service ----------------------------- */

/**
 * Runs arbitrary code against supplied cases. Authentication/authorization is
 * handled by the route layer; this service has no Express dependency.
 */
export async function runRawCodeService({
  languageId,
  code,
  cases,
}: RunRawCodeRequest): Promise<RunRawCodeResponse> {
  const normalizedLanguage = normalizeLanguage(languageId);

  if (!normalizedLanguage) {
    throw new ValidationError("Unsupported language");
  }

  const normalizedTestcases: NormalizedTestcase[] = (cases ?? [])
    .map((testCase, index) => ({
      testcaseId: `tc-${index + 1}`,
      input: testCase.input ?? "",
      expectedOutput: testCase.output ?? "",
    }))
    .filter((testCase) => Boolean(testCase.input) || Boolean(testCase.expectedOutput));

  if (normalizedTestcases.length === 0) {
    throw new NotFoundError("No test cases available");
  }

  const result = await executeSubmission(
    { language: normalizedLanguage, sourceCode: code },
    normalizedTestcases,
  );

  const responses: PistonExecutionResult[] = result.details.map((detail) => ({
    language: normalizedLanguage,
    version: "*",
    run: {
      stdout: detail.stdout,
      stderr: detail.stderr ?? "",
      output: detail.stdout,
      code: detail.passed ? 0 : 1,
      signal: null,
    },
  }));

  const results: RunCaseResult[] = result.details.map((detail) => ({
    input: detail.stdout,
    expectedOutput: detail.expectedOutput,
    actualOutput: detail.stdout,
    passed: detail.passed,
  }));

  return {
    responses,
    cases: result.details.map((detail) => ({
      input: detail.input,
      output: detail.expectedOutput,
    })),
    results,
    passedCount: result.passedCount,
    totalCount: result.totalTestcases,
  };
}
