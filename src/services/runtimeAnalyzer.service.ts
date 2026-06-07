import { Request } from "express";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import axios from "axios";
import prisma from "../utils/prisma";
import { isSupportedLanguageKey, type LanguageKey } from "@/utils/languageCatalog";
import type {
  RuntimeAnalysisResult,
  NormalCasesResult,
  NormalCaseResult,
  StressCaseResult,
} from "@/types/runtimeAnalyzer.types";

interface TestCase {
  input: string;
  output: string;
}

interface PistonStage {
  stdout?: string;
  stderr?: string;
  output?: string;
  code?: number;
  signal?: string;
  cpu_time?: number;
  memory?: number;
}

interface PistonExecutionResult {
  language: string;
  version: string;
  run: PistonStage;
  compile?: PistonStage;
}

interface PistonExecuteRequest {
  language: string;
  version: string;
  files: Array<{ name?: string; content: string }>;
  stdin: string;
}

const PISTON_LANGUAGE_MAP: Record<LanguageKey, string> = {
  c: "c",
  cpp: "cpp",
  python: "python",
  java: "java",
};

const CASE_START_MARKER = "__CASE_START__";
const CASE_END_MARKER = "__CASE_END__";
const ALT_CASE_START_MARKER = "CASE_START_MARKER";
const ALT_CASE_END_MARKER = "CASE_END_MARKER";
const SINGLE_CASE_START_MARKER = "_CASE_START_";
const SINGLE_CASE_END_MARKER = "_CASE_END_";

const caseStartMarkers = [CASE_START_MARKER, ALT_CASE_START_MARKER, SINGLE_CASE_START_MARKER] as const;
const caseEndMarkers = [CASE_END_MARKER, ALT_CASE_END_MARKER, SINGLE_CASE_END_MARKER] as const;
const allCaseMarkers = [...caseStartMarkers, ...caseEndMarkers] as const;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stripCaseDelimiters(content: string): string {
  let normalized = (content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const marker of allCaseMarkers) {
    normalized = normalized.replace(new RegExp(`^\\s*${escapeRegex(marker)}\\s*$`, "gm"), "");
  }
  return normalized.trim();
}

function splitPlainLines(content: string): string[] {
  const normalized = stripCaseDelimiters(content ?? "");
  if (!normalized) return [];
  return normalized.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

function normalizeForCompare(value: string): string {
  return splitPlainLines(value ?? "").join("\n");
}

function extractMarkedBlocks(content: string): string[] {
  const escapedStarts = caseStartMarkers.map(escapeRegex);
  const escapedEnds = caseEndMarkers.map(escapeRegex);
  const pattern = new RegExp(`(?:${escapedStarts.join("|")})[\\s\\S]*?(?:${escapedEnds.join("|")})`, "g");
  return (content.match(pattern) ?? []).map(b => b.trim());
}

function stripBlockMarkers(block: string): string {
  return allCaseMarkers.reduce((cleaned, marker) =>
    cleaned.replace(new RegExp(escapeRegex(marker), "g"), ""), block).trim();
}

function getOutputBlocks(content: string, expectedLineCount?: number | null): string[] {
  const marked = extractMarkedBlocks(content);
  if (marked.length > 0) return marked.map(stripBlockMarkers);
  const lines = splitPlainLines(content);
  if (expectedLineCount && expectedLineCount > 1 && lines.length === expectedLineCount) return lines;
  return [lines.join("\n")];
}

function getMarkedOutputBlocksStrict(content: string): string[] {
  const marked = extractMarkedBlocks(content);
  if (marked.length === 0) return [];
  return marked.map(stripBlockMarkers);
}

function buildAggregatedInput(cases: TestCase[]): string {
  let totalCaseCount = 0;
  const bodyParts: string[] = [];

  for (const testCase of cases) {
    const input = stripCaseDelimiters(testCase.input ?? "");
    const newlineIndex = input.indexOf("\n");
    const head = newlineIndex === -1 ? input : input.slice(0, newlineIndex);
    const body = newlineIndex === -1 ? "" : input.slice(newlineIndex + 1).trim();
    const count = Number.parseInt(head.trim(), 10);

    if (!Number.isFinite(count) || count < 0) {
      return cases.map(e => stripCaseDelimiters(e.input ?? "")).join("\n");
    }

    totalCaseCount += count;
    if (body) bodyParts.push(body);
  }

  if (totalCaseCount === 0) return "0";
  return `${totalCaseCount}\n${bodyParts.join("\n")}`.trim();
}

function parseCaseCountFromInput(input: string): number | null {
  const firstLine = stripCaseDelimiters(input ?? "").split("\n")[0]?.trim();
  if (!firstLine) return null;
  const count = Number.parseInt(firstLine, 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function sanitizeSourceCode(code: string): string {
  return code
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[""`]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function getPistonExecuteUrl(): string {
  const pistonUri = process.env.PISTON_URI?.trim();
  if (!pistonUri) {
    const err = new Error("PISTON_URI environment variable is missing");
    (err as any).status = 500;
    throw err;
  }
  return `${pistonUri.replace(/\/+$/, "")}/api/v2/execute`;
}

async function runNormalCases(
  code: string,
  language: LanguageKey,
  testCases: TestCase[],
): Promise<NormalCasesResult> {
  const pistonLang = PISTON_LANGUAGE_MAP[language];
  const pistonUrl = getPistonExecuteUrl();

  const sanitizedCases = testCases.map(tc => ({
    ...tc,
    input: stripCaseDelimiters(tc.input ?? ""),
    output: (tc.output ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
  }));

  const expectedUsesMarkers = sanitizedCases.some(
    tc => extractMarkedBlocks(tc.output ?? "").length > 0,
  );

  const payload: PistonExecuteRequest = {
    language: pistonLang,
    version: "*",
    files: pistonLang === "java"
      ? [{ name: "Main.java", content: code }]
      : [{ content: code }],
    stdin: buildAggregatedInput(sanitizedCases),
  };

  const response = await axios.post<PistonExecutionResult>(pistonUrl, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });

  const compile = response.data.compile;
  const run = response.data.run ?? {};

  if (compile?.stderr?.trim()) {
    return {
      totalRuntimeMs: 0,
      totalMemoryKb: 0,
      passedCount: 0,
      totalCount: sanitizedCases.length,
      compilationError: compile.stderr,
      cases: sanitizedCases.map((_, i) => ({
        testcaseId: `tc-${i + 1}`,
        status: "RUNTIME_ERROR" as const,
      })),
    };
  }

  const totalRuntimeMs = Math.round((run.cpu_time ?? 0) * 1000);
  const totalMemoryKb = (run.memory ?? 0) > 0 ? Math.round((run.memory ?? 0) / 1024) : 0;

  const expectedLineCountHints = sanitizedCases.length === 1
    ? [parseCaseCountFromInput(sanitizedCases[0]?.input ?? "")]
    : sanitizedCases.map(() => null);

  const expectedBlocksByCase = sanitizedCases.map((tc, idx) =>
    getOutputBlocks(tc.output ?? "", expectedLineCountHints[idx]));

  const shouldExpand = sanitizedCases.length === 1 && expectedBlocksByCase[0]?.length > 1;

  const normalizedCases = shouldExpand
    ? expectedBlocksByCase[0].map((block, idx) => ({ input: `Case ${idx + 1}`, output: block }))
    : sanitizedCases.map((tc, idx) => ({ ...tc, output: expectedBlocksByCase[idx].join("\n") }));

  const expectedBlockCounts = shouldExpand
    ? expectedBlocksByCase[0].map(() => 1)
    : expectedBlocksByCase.map(b => Math.max(b.length, 1));

  const expectedTotalBlocks = expectedBlockCounts.reduce((s, c) => s + c, 0);
  const rawStdout = run.stdout ?? run.output ?? "";

  const allBlocks = expectedUsesMarkers
    ? getMarkedOutputBlocksStrict(rawStdout)
    : getOutputBlocks(rawStdout, expectedTotalBlocks);

  const missingRequiredMarkers = expectedUsesMarkers && allBlocks.length === 0;
  const reconciledBlocks = [...allBlocks];

  if (reconciledBlocks.length === 0) reconciledBlocks.push(rawStdout.trim());
  while (reconciledBlocks.length < expectedTotalBlocks) reconciledBlocks.push("");

  let offset = 0;
  const hasCompileOrRuntimeError =
    Boolean(run.stderr?.trim()) || (typeof run.code === "number" && run.code !== 0);

  const caseResults: NormalCaseResult[] = [];
  let passedCount = 0;

  for (let i = 0; i < normalizedCases.length; i++) {
    const blockCount = expectedBlockCounts[i] ?? 1;
    const caseBlocks = reconciledBlocks.slice(offset, offset + blockCount).join("\n");
    offset += blockCount;

    const passed =
      !hasCompileOrRuntimeError &&
      !missingRequiredMarkers &&
      normalizeForCompare(caseBlocks) === normalizeForCompare(normalizedCases[i].output);

    if (passed) passedCount++;

    caseResults.push({
      testcaseId: `tc-${i + 1}`,
      status: passed ? "ACCEPTED" : hasCompileOrRuntimeError ? "RUNTIME_ERROR" : "WRONG_ANSWER",
    });
  }

  return {
    totalRuntimeMs,
    totalMemoryKb,
    passedCount,
    totalCount: sanitizedCases.length,
    cases: caseResults,
  };
}

function generateArray(size: number, min: number, max: number, pattern: string): number[] {
  const arr = Array.from({ length: size }, () =>
    Math.floor(Math.random() * (max - min + 1)) + min,
  );
  if (pattern === "SORTED") arr.sort((a, b) => a - b);
  if (pattern === "REVERSE") arr.sort((a, b) => b - a);
  if (pattern === "CONSTANT") arr.fill(arr[0]);
  return arr;
}

function generateString(size: number, pattern: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < size; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  if (pattern === "SORTED") result = result.split("").sort().join("");
  if (pattern === "REVERSE") result = result.split("").sort().reverse().join("");
  if (pattern === "CONSTANT") result = result[0].repeat(size);
  return result;
}

function generateMatrix(size: number, min: number, max: number, pattern: string): number[][] {
  const matrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    const row = Array.from({ length: size }, () =>
      Math.floor(Math.random() * (max - min + 1)) + min,
    );
    if (pattern === "SORTED") row.sort((a, b) => a - b);
    if (pattern === "REVERSE") row.sort((a, b) => b - a);
    if (pattern === "CONSTANT") row.fill(row[0]);
    matrix.push(row);
  }
  return matrix;
}

function generateStressInput(
  type: string,
  size: number,
  minValue: number,
  maxValue: number,
  pattern: string,
): string {
  switch (type) {
    case "ARRAY": {
      const arr = generateArray(size, minValue, maxValue, pattern);
      return `${size}\n${arr.join(" ")}`;
    }
    case "STRING": {
      const str = generateString(size, pattern);
      return `${size}\n${str}`;
    }
    case "MATRIX": {
      const matrix = generateMatrix(size, minValue, maxValue, pattern);
      const rows = matrix.map(row => row.join(" ")).join("\n");
      return `${size}\n${rows}`;
    }
    default:
      return `${size}\n${"0 ".repeat(size).trim()}`;
  }
}

function computeSummary(stressCases: StressCaseResult[]): {
  fastestRuntimeMs: number;
  slowestRuntimeMs: number;
  averageRuntimeMs: number;
  maxMemoryKb: number;
  averageMemoryKb: number;
} | null {
  if (stressCases.length === 0) return null;

  const runtimes = stressCases.map(s => s.runtimeMs);
  const memories = stressCases.map(s => s.memoryKb);

  return {
    fastestRuntimeMs: Math.min(...runtimes),
    slowestRuntimeMs: Math.max(...runtimes),
    averageRuntimeMs: Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length),
    maxMemoryKb: Math.max(...memories),
    averageMemoryKb: Math.round(memories.reduce((a, b) => a + b, 0) / memories.length),
  };
}

export async function analyzeRuntime(
  req: Request,
  problemId: string,
  language: string,
  sourceCode: string,
): Promise<RuntimeAnalysisResult> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
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
      problemTestGenerators: true,
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
      try { parsed = JSON.parse(parsed); } catch { parsed = []; }
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const input = item && typeof (item as any).input === "string" ? (item as any).input : "";
        const output = item && typeof (item as any).output === "string" ? (item as any).output : "";
        if (input || output) allTestCases.push({ input, output });
      }
    }
  }

  // Build final code with driver header/footer
  const driver = problem.driverCode.find(d => d.language === normalizedLanguage);
  const finalCode = sanitizeSourceCode(
    `${driver?.header ?? ""}\n${sourceCode}\n${driver?.footer ?? ""}`,
  );

  // Step 1: Run normal test cases (aggregated)
  let normalCases: NormalCasesResult | null = null;

  if (allTestCases.length > 0) {
    try {
      normalCases = await runNormalCases(finalCode, normalizedLanguage, allTestCases);

      if (normalCases.compilationError) {
        return {
          normalCases,
          stressCases: [],
          summary: null,
          compilationError: normalCases.compilationError,
        };
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const details = typeof error.response?.data === "string"
          ? error.response.data
          : JSON.stringify(error.response?.data ?? {});
        return {
          normalCases: null,
          stressCases: [],
          summary: null,
          compilationError: `Piston execution failed: ${error.message}. ${details}`,
        };
      }
      throw error;
    }
  }

  // Step 2: Run stress test cases (per size, concurrent with limit)
  const stressCases: StressCaseResult[] = [];
  const generator = problem.problemTestGenerators;

  if (generator && generator.sizes.length > 0) {
    const sizes = generator.sizes.filter(s => s > 0);
    const pistonLang = PISTON_LANGUAGE_MAP[normalizedLanguage];
    const CONCURRENCY = 3;

    const runOne = async (size: number): Promise<StressCaseResult> => {
      const input = generateStressInput(
        generator.type,
        size,
        generator.minValue,
        generator.maxValue,
        generator.pattern,
      );

      const stressStdin = `1\n${input}`;
      const inputBytes = Buffer.byteLength(stressStdin, "utf-8");

      const payload: PistonExecuteRequest = {
        language: pistonLang,
        version: "*",
        files: pistonLang === "java"
          ? [{ name: "Main.java", content: finalCode }]
          : [{ content: finalCode }],
        stdin: stressStdin,
      };

      try {
        const response = await axios.post<PistonExecutionResult>(getPistonExecuteUrl(), payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        });

        const run = response.data.run ?? {};
        const runtimeMs = Math.round((run.cpu_time ?? 0));
        const memoryKb = (run.memory ?? 0) > 0 ? Math.round((run.memory ?? 0)) : 0;

        return {
          size,
          runtimeMs,
          memoryKb,
          inputBytes,
          generatorType: generator.type,
          pattern: generator.pattern,
        };
      } catch {
        return {
          size,
          runtimeMs: 0,
          memoryKb: 0,
          inputBytes,
          generatorType: generator.type,
          pattern: generator.pattern,
        };
      }
    };

    // Run with concurrency limit using batches
    for (let i = 0; i < sizes.length; i += CONCURRENCY) {
      const batch = sizes.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(runOne));
      for (const r of results) {
        if (r.status === "fulfilled") stressCases.push(r.value);
      }
    }
  }

  const summary = computeSummary(stressCases);

  return {
    normalCases,
    stressCases,
    summary,
  };
}
