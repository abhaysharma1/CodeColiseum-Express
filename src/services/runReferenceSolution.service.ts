import { Request } from "express";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import { fromRuntimeLanguageId } from "@/utils/languageCatalog";
import { executeSubmission } from "./codeExecutor.service";
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

export async function runRawCodeService(
  req: Request,
  { languageId, code, cases }: RunRawCodeRequest,
): Promise<RunRawCodeResponse> {
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

  const normalizedTestcases: NormalizedTestcase[] = (cases ?? [])
    .map((tc, idx) => ({
      testcaseId: `tc-${idx + 1}`,
      input: tc.input ?? "",
      expectedOutput: tc.output ?? "",
    }))
    .filter((tc) => Boolean(tc.input) || Boolean(tc.expectedOutput));

  if (normalizedTestcases.length === 0) {
    const error = new Error("No test cases available");
    (error as any).status = 404;
    throw error;
  }

  const result = await executeSubmission(
    { language: normalizedLanguage, sourceCode: code },
    normalizedTestcases,
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
