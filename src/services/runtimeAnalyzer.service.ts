import { Request } from "express";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import axios from "axios";
import prisma from "../utils/prisma";
import {
  isSupportedLanguageKey,
  type LanguageKey,
} from "@/utils/languageCatalog";
import type {
  RuntimeAnalysisResult,
  NormalCasesResult,
  NormalCaseResult,
  PerformanceCaseResult,
} from "@/types/runtimeAnalyzer.types";
import { executeSubmission, runPerformanceTests } from "./codeExecutor.service";
import type { NormalizedTestcase } from "./types";

interface TestCase {
  input: string;
  output: string;
}

export async function analyzeRuntime(
  req: Request,
  problemId: string,
  language: string,
  sourceCode: string,
): Promise<RuntimeAnalysisResult> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session?.user?.id) {
    const err = new Error("Login required");
    (err as any).status = 401;
    throw err;
  }

  const normalizedLanguage = language.trim().toLowerCase() as LanguageKey;
  if (!isSupportedLanguageKey(normalizedLanguage)) {
    const err = new Error(`Unsupported language: ${language}`);
    (err as any).status = 400;
    throw err;
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      testCase: true,
      runTestCase: true,
      driverCode: true,
      performanceConstraints: true,
      performanceTestCases: true,
    },
  });

  if (!problem) {
    const err = new Error("Problem not found");
    (err as any).status = 404;
    throw err;
  }

  // Collect all test cases (public + hidden)
  const allTestCases: TestCase[] = [];
  for (const tcSource of [problem.testCase, problem.runTestCase]) {
    if (!tcSource) continue;
    let parsed: unknown = tcSource.cases;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = [];
      }
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const input =
          item && typeof (item as any).input === "string"
            ? (item as any).input
            : "";
        const output =
          item && typeof (item as any).output === "string"
            ? (item as any).output
            : "";
        if (input || output) allTestCases.push({ input, output });
      }
    }
  }

  // Build final code with driver header/footer
  const driver = problem.driverCode.find(
    (d) => d.language === normalizedLanguage,
  );

  // Step 1: Run normal test cases
  let normalCases: NormalCasesResult | null = null;

  if (allTestCases.length > 0) {
    try {
      const normalizedTestcases: NormalizedTestcase[] = allTestCases.map(
        (tc, idx) => ({
          testcaseId: `tc-${idx + 1}`,
          input: tc.input,
          expectedOutput: tc.output,
        }),
      );

      const result = await executeSubmission(
        { language: normalizedLanguage, sourceCode },
        normalizedTestcases,
        { header: driver?.header ?? null, footer: driver?.footer ?? null },
      );

      const caseResults: NormalCaseResult[] = result.details.map((d) => ({
        testcaseId: d.testcaseId,
        status: d.passed
          ? ("ACCEPTED" as const)
          : d.stderr
            ? ("RUNTIME_ERROR" as const)
            : ("WRONG_ANSWER" as const),
        input: d.input,
        expectedOutput: d.expectedOutput,
        actualOutput: d.stdout,
        stderr: d.stderr,
      }));

      normalCases = {
        totalRuntimeMs: result.executionTimeMs,
        totalMemoryKb: result.memoryKb,
        passedCount: result.passedCount,
        totalCount: result.totalTestcases,
        cases: caseResults,
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const details =
          typeof error.response?.data === "string"
            ? error.response.data
            : JSON.stringify(error.response?.data ?? {});
        return {
          normalCases: null,
          performanceCases: [],
          summary: null,
          compilationError: `Piston execution failed: ${error.message}. ${details}`,
        };
      }
      if (error?.context?.status === "COMPILE_ERROR") {
        return {
          normalCases: {
            totalRuntimeMs: 0,
            totalMemoryKb: 0,
            passedCount: 0,
            totalCount: allTestCases.length,
            compilationError: error.context.stderr,
            cases: allTestCases.map((_, i) => ({
              testcaseId: `tc-${i + 1}`,
              status: "RUNTIME_ERROR" as const,
            })),
          },
          performanceCases: [],
          summary: null,
        };
      }
      throw error;
    }
  }

  // Step 2: Run performance test cases from S3
  let performanceCases: PerformanceCaseResult[] = [];
  if (problem.performanceTestCases.length > 0) {
    try {
      const perfResult = await runPerformanceTests(
        { language: normalizedLanguage, sourceCode },
        problem.performanceTestCases.map((ptc) => ({
          name: ptc.name,
          inputFileKey: ptc.inputFileKey,
          outputFileKey: ptc.outputFileKey,
        })),
        problem.performanceConstraints,
        { header: driver?.header ?? null, footer: driver?.footer ?? null },
      );

      if (perfResult.status === "ACCEPTED") {
        performanceCases = problem.performanceTestCases.map((ptc) => ({
          id: ptc.id,
          name: ptc.name,
          runtimeMs: perfResult.executionTimeMs,
          memoryKb: perfResult.memoryKb,
          inputBytes: 0,
          status: "ACCEPTED" as const,
        }));
      } else {
        const failedIdx = perfResult.passedCount;
        performanceCases = problem.performanceTestCases.map((ptc, idx) => ({
          id: ptc.id,
          name: ptc.name,
          runtimeMs: idx < perfResult.passedCount
            ? perfResult.executionTimeMs
            : 0,
          memoryKb: idx < perfResult.passedCount ? perfResult.memoryKb : 0,
          inputBytes: 0,
          status:
            idx < perfResult.passedCount
              ? ("ACCEPTED" as const)
              : idx === failedIdx
                ? perfResult.status === "BAD_SCALING"
                  ? ("TIME_LIMIT_EXCEEDED" as const)
                  : ("WRONG_ANSWER" as const)
                : ("TIME_LIMIT_EXCEEDED" as const),
        }));
      }
    } catch (error: any) {
      const errMsg = error?.message ?? "Performance test execution failed";
      performanceCases = problem.performanceTestCases.map((ptc) => ({
        id: ptc.id,
        name: ptc.name,
        runtimeMs: 0,
        memoryKb: 0,
        inputBytes: 0,
        status: "RUNTIME_ERROR" as const,
        stderr: errMsg,
      }));
    }
  }

  const summary = computePerformanceSummary(performanceCases);

  return {
    normalCases,
    performanceCases,
    summary,
  };
}

function computePerformanceSummary(
  performanceCases: PerformanceCaseResult[],
): RuntimeAnalysisResult["summary"] {
  if (performanceCases.length === 0) return null;

  const runtimes = performanceCases
    .filter((pc) => pc.status === "ACCEPTED")
    .map((pc) => pc.runtimeMs);
  const memories = performanceCases
    .filter((pc) => pc.status === "ACCEPTED")
    .map((pc) => pc.memoryKb);

  if (runtimes.length === 0) return null;

  return {
    fastestRuntimeMs: Math.min(...runtimes),
    slowestRuntimeMs: Math.max(...runtimes),
    averageRuntimeMs: Math.round(
      runtimes.reduce((a, b) => a + b, 0) / runtimes.length,
    ),
    maxMemoryKb: Math.max(...memories),
    averageMemoryKb: Math.round(
      memories.reduce((a, b) => a + b, 0) / memories.length,
    ),
  };
}
