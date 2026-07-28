import axios from "axios";
import type {
  ExecuteCodeRequest,
  ExecuteCodeResponse,
  ExecuteCodeBatchRequest,
  ExecutionResult,
  NormalizedTestcase,
  PerformanceTestResult,
  ExecutionFailureContext,
} from "./types";

/* ----------------------------- Helpers ----------------------------- */

const CASE_START_MARKER = "__CASE_START__";
const CASE_END_MARKER = "__CASE_END__";
const ALT_CASE_START_MARKER = "CASE_START_MARKER";
const ALT_CASE_END_MARKER = "CASE_END_MARKER";
const SINGLE_CASE_START_MARKER = "_CASE_START_";
const SINGLE_CASE_END_MARKER = "_CASE_END_";

const caseStartMarkers = [
  CASE_START_MARKER,
  ALT_CASE_START_MARKER,
  SINGLE_CASE_START_MARKER,
] as const;
const caseEndMarkers = [
  CASE_END_MARKER,
  ALT_CASE_END_MARKER,
  SINGLE_CASE_END_MARKER,
] as const;
const allCaseMarkers = [...caseStartMarkers, ...caseEndMarkers] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripCaseDelimiters(content: string): string {
  let normalized = (content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const marker of allCaseMarkers) {
    normalized = normalized.replace(
      new RegExp(`^\\s*${escapeRegex(marker)}\\s*$`, "gm"),
      "",
    );
  }
  return normalized.trim();
}

function splitPlainLines(content: string): string[] {
  const normalized = stripCaseDelimiters(content ?? "");
  if (!normalized) return [];
  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeForCompare(value: string): string {
  return splitPlainLines(value ?? "").join("\n");
}

export function sanitizeSourceCode(code: string): string {
  return code
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[""`]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function extractMarkedBlocks(content: string): string[] {
  const escapedStarts = caseStartMarkers.map(escapeRegex);
  const escapedEnds = caseEndMarkers.map(escapeRegex);
  const pattern = new RegExp(
    `(?:${escapedStarts.join("|")})[\\s\\S]*?(?:${escapedEnds.join("|")})`,
    "g",
  );
  return (content.match(pattern) ?? []).map((b) => b.trim());
}

function stripBlockMarkers(block: string): string {
  return allCaseMarkers
    .reduce(
      (cleaned, marker) =>
        cleaned.replace(new RegExp(escapeRegex(marker), "g"), ""),
      block,
    )
    .trim();
}

function getOutputBlocks(
  content: string,
  expectedLineCount?: number | null,
): string[] {
  const marked = extractMarkedBlocks(content);
  if (marked.length > 0) return marked.map(stripBlockMarkers);
  const lines = splitPlainLines(content);
  if (
    expectedLineCount &&
    expectedLineCount > 1 &&
    lines.length === expectedLineCount
  )
    return lines;
  return [lines.join("\n")];
}

function getMarkedOutputBlocksStrict(content: string): string[] {
  const marked = extractMarkedBlocks(content);
  if (marked.length === 0) return [];
  return marked.map(stripBlockMarkers);
}

function parseCaseCountFromInput(input: string): number | null {
  const firstLine = stripCaseDelimiters(input ?? "")
    .split("\n")[0]
    ?.trim();
  if (!firstLine) return null;
  const count = Number.parseInt(firstLine, 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function splitAggregatedInputCases(
  input: string,
  expectedCount: number,
): string[] {
  const cleanedInput = stripCaseDelimiters(input ?? "");
  const lines = cleanedInput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];
  const declaredCount = Number.parseInt(lines[0], 10);
  const remaining = lines.slice(1);
  const targetCount =
    Number.isFinite(declaredCount) && declaredCount > 0
      ? declaredCount
      : expectedCount;
  if (targetCount <= 0 || remaining.length === 0) return [];
  if (remaining.length % targetCount === 0) {
    const chunkSize = remaining.length / targetCount;
    const chunks: string[] = [];
    for (let i = 0; i < targetCount; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      chunks.push(remaining.slice(start, end).join("\n").trim());
    }
    return chunks;
  }
  return [];
}

function getInputBlocks(input: string, expectedCount: number): string[] {
  const markedBlocks = extractMarkedBlocks(input ?? "");
  if (markedBlocks.length > 0) return markedBlocks.map(stripBlockMarkers);
  return splitAggregatedInputCases(input, expectedCount);
}

function buildAggregatedInput(
  cases: Array<{ input: string; output: string }>,
): string {
  let totalCaseCount = 0;
  const bodyParts: string[] = [];
  for (const testCase of cases) {
    const input = stripCaseDelimiters(testCase.input ?? "");
    const newlineIndex = input.indexOf("\n");
    const head = newlineIndex === -1 ? input : input.slice(0, newlineIndex);
    const body =
      newlineIndex === -1 ? "" : input.slice(newlineIndex + 1).trim();
    const count = Number.parseInt(head.trim(), 10);
    if (!Number.isFinite(count) || count < 0) {
      return cases.map((e) => stripCaseDelimiters(e.input ?? "")).join("\n");
    }
    totalCaseCount += count;
    if (body) bodyParts.push(body);
  }
  if (totalCaseCount === 0) return "0";
  return `${totalCaseCount}\n${bodyParts.join("\n")}`.trim();
}

function hasMarkers(content: string): boolean {
  return extractMarkedBlocks(content ?? "").length > 0;
}

function normalizeLanguage(
  language: string,
): "c" | "cpp" | "python" | "java" | null {
  const value = language.trim().toLowerCase();
  if (
    value === "c" ||
    value === "cpp" ||
    value === "python" ||
    value === "java"
  ) {
    return value;
  }
  return null;
}

function toMs(cpuTime?: number): number {
  return cpuTime ?? 0;
}

function toKb(bytes?: number): number {
  if (!bytes || Number.isNaN(bytes)) return 0;
  return Math.round(bytes / 1024);
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

/* ----------------------------- Error ----------------------------- */

export class SubmissionExecutionError extends Error {
  readonly context: ExecutionFailureContext;

  constructor(message: string, context: ExecutionFailureContext) {
    super(message);
    this.name = "SubmissionExecutionError";
    this.context = context;
  }
}

/* ----------------------------- Internal Types ----------------------------- */

interface PistonRun {
  stdin?: string;
  args?: string[];
  stdout?: string;
  stderr?: string;
  output?: string;
  code?: number | null;
  signal?: string | null;
  cpu_time?: number;
  wall_time?: number;
  memory?: number;
  message?: string;
  status?: string;
  reason?: string;
}

interface PistonResponse {
  language?: string;
  version?: string;
  run?: {
    stdout?: string;
    stderr?: string;
    output?: string;
    code?: number;
    signal?: string;
    cpu_time?: number;
    memory?: number;
  };
  compile?: {
    stdout?: string;
    stderr?: string;
    output?: string;
    code?: number;
    signal?: string;
    cpu_time?: number;
    memory?: number;
  };
  runs?: PistonRun[];
}

/* ----------------------------- Core Execution Functions ----------------------------- */

async function runCode(
  request: ExecuteCodeRequest,
): Promise<ExecuteCodeResponse> {
  const response = await axios.post<PistonResponse>(
    getPistonExecuteUrl(),
    {
      language: request.language,
      version: request.version ?? "*",
      files: request.files,
      stdin: request.stdin ?? "",
      run_timeout: request.run_timeout ?? 5000,
      compile_timeout: request.compile_timeout ?? 5000,
    },
    {
      timeout: 30_000,
      headers: { "Content-Type": "application/json" },
    },
  );

  const compileError = response.data.compile?.stderr;
  if (compileError && compileError.trim().length > 0) {
    throw new SubmissionExecutionError("Compilation failed", {
      status: "COMPILE_ERROR",
      stderr: compileError,
    });
  }

  const run = response.data.run ?? {};
  return {
    stdout: run.stdout ?? run.output ?? "",
    stderr: run.stderr,
    exitCode: run.code,
    timeMs: toMs(run.cpu_time),
    memoryKb: toKb(run.memory),
  };
}

async function runCodeBatch(
  request: ExecuteCodeBatchRequest,
): Promise<PistonRun[]> {
  const response = await axios.post<PistonResponse>(
    getPistonExecuteUrl(),
    {
      language: request.language,
      version: request.version ?? "*",
      files: request.files,
      test_cases: request.test_cases,
      stop_on_first_failure: request.stop_on_first_failure ?? false,
      compile_timeout: request.compile_timeout ?? 10000,
      run_timeout: request.run_timeout ?? 3000,
      aggregate_run_timeout: request.aggregate_run_timeout,
    },
    {
      timeout: 300_000,
      headers: { "Content-Type": "application/json" },
    },
  );

  if (response.data.compile?.stderr?.trim()) {
    console.log(response.data.compile);
    throw new SubmissionExecutionError("Compilation failed", {
      status: "COMPILE_ERROR",
      stderr: response.data.compile.stderr,
    });
  }

  return response.data.runs ?? [];
}

/* ----------------------------- Public API ----------------------------- */

export async function executeSubmission(
  submission: { language: string; sourceCode: string },
  testcases: NormalizedTestcase[],
  driver?: { header: string | null; footer: string | null },
): Promise<ExecutionResult> {
  const language = normalizeLanguage(submission.language);
  if (!language) {
    throw new SubmissionExecutionError(
      `Unsupported language: ${submission.language}`,
      { status: "INTERNAL_ERROR" },
    );
  }

  const sourceCode = sanitizeSourceCode(
    `${driver?.header ?? ""}\n${submission.sourceCode}\n${driver?.footer ?? ""}`,
  );

  const usesMarkers = testcases.some((tc) =>
    hasMarkers(tc.expectedOutput ?? ""),
  );

  const cleanedCases = testcases.map((tc) => ({
    ...tc,
    input: stripCaseDelimiters(tc.input ?? ""),
    expectedOutput: usesMarkers
      ? (tc.expectedOutput ?? "")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .trim()
      : stripCaseDelimiters(tc.expectedOutput ?? ""),
  }));

  if (usesMarkers) {
    return executeLegacyMarkers(language, sourceCode, cleanedCases);
  }
  return executeBatch(language, sourceCode, cleanedCases);
}

async function executeBatch(
  language: string,
  sourceCode: string,
  cases: NormalizedTestcase[],
): Promise<ExecutionResult> {
  const testCasesPayload = cases.map((tc) => ({
    stdin: tc.input,
  }));

  const runs = await runCodeBatch({
    language,
    version: "*",
    files: [
      {
        name: language === "java" ? "Main.java" : "main",
        content: sourceCode,
      },
    ],
    test_cases: testCasesPayload,
    run_timeout: 5000,
    compile_timeout: 5000,
  });

  let passedCount = 0;
  let failedCaseIndex: number | null = null;
  const details: ExecutionResult["details"] = [];
  const maxLength = Math.min(runs.length, cases.length);

  for (let i = 0; i < maxLength; i += 1) {
    const run = runs[i];
    const tc = cases[i];

    if (run.status === "skipped") {
      details.push({
        testcaseId: tc.testcaseId,
        input: tc.input,
        passed: false,
        stdout: "",
        expectedOutput: tc.expectedOutput,
        stderr: run.reason ?? "skipped",
        timeMs: 0,
        memoryKb: 0,
      });
      if (failedCaseIndex === null) failedCaseIndex = i;
      continue;
    }

    const hasError = run.code !== 0 || run.signal != null;
    const stdout = run.stdout ?? run.output ?? "";
    const passed =
      !hasError &&
      normalizeForCompare(stdout) === normalizeForCompare(tc.expectedOutput);

    if (passed) {
      passedCount += 1;
    } else if (failedCaseIndex === null) {
      failedCaseIndex = i;
    }

    details.push({
      testcaseId: tc.testcaseId,
      input: tc.input,
      passed,
      stdout,
      expectedOutput: tc.expectedOutput,
      stderr: run.stderr || undefined,
      timeMs: toMs(run.cpu_time),
      memoryKb: toKb(run.memory),
    });
  }

  for (let i = maxLength; i < cases.length; i += 1) {
    details.push({
      testcaseId: cases[i].testcaseId,
      input: cases[i].input,
      passed: false,
      stdout: "",
      expectedOutput: cases[i].expectedOutput,
      stderr: "No result from executor",
      timeMs: 0,
      memoryKb: 0,
    });
    if (failedCaseIndex === null) failedCaseIndex = i;
  }

  const totalTimeMs = details.reduce((sum, d) => sum + d.timeMs, 0);
  const maxMemoryKb = details.reduce((max, d) => Math.max(max, d.memoryKb), 0);

  return {
    passedCount,
    totalTestcases: cases.length,
    executionTimeMs: totalTimeMs,
    memoryKb: maxMemoryKb,
    failedCaseIndex,
    details,
  };
}

async function executeLegacyMarkers(
  language: string,
  sourceCode: string,
  cases: NormalizedTestcase[],
): Promise<ExecutionResult> {
  const dbCases = cases.map((tc) => ({
    input: tc.input,
    output: tc.expectedOutput,
  }));

  const expectedUsesMarkers = dbCases.some(
    (tc) => extractMarkedBlocks(tc.output ?? "").length > 0,
  );

  const expectedLineCountHints =
    dbCases.length === 1
      ? [parseCaseCountFromInput(dbCases[0]?.input ?? "")]
      : dbCases.map(() => null);

  const expectedBlocksByCase = dbCases.map((tc, idx) =>
    getOutputBlocks(tc.output ?? "", expectedLineCountHints[idx]),
  );

  const shouldExpandAggregatedCase =
    dbCases.length === 1 && expectedBlocksByCase[0]?.length > 1;

  const expandedInputs = shouldExpandAggregatedCase
    ? getInputBlocks(cases[0]?.input ?? "", expectedBlocksByCase[0].length)
    : [];

  const normalizedCases = shouldExpandAggregatedCase
    ? expectedBlocksByCase[0].map((block, idx) => ({
        input: expandedInputs[idx] || `Case ${idx + 1}`,
        output: block,
      }))
    : dbCases.map((tc, idx) => {
        const blocks = expectedBlocksByCase[idx];
        return { ...tc, output: blocks.join("\n") };
      });

  const expectedBlockCounts = shouldExpandAggregatedCase
    ? expectedBlocksByCase[0].map(() => 1)
    : expectedBlocksByCase.map((blocks) => Math.max(blocks.length, 1));

  const expectedTotalBlocks = expectedBlockCounts.reduce(
    (sum, count) => sum + count,
    0,
  );

  const execResult = await runCode({
    language,
    version: "*",
    files: [
      {
        name: language === "java" ? "Main.java" : "main",
        content: sourceCode,
      },
    ],
    stdin: buildAggregatedInput(dbCases),
    run_timeout: 5000,
    compile_timeout: 5000,
  });

  const rawStdout = execResult.stdout;
  const allBlocks = expectedUsesMarkers
    ? getMarkedOutputBlocksStrict(rawStdout)
    : getOutputBlocks(rawStdout, expectedTotalBlocks);

  const missingRequiredMarkers = expectedUsesMarkers && allBlocks.length === 0;
  const reconciledBlocks = [...allBlocks];

  if (reconciledBlocks.length === 0) reconciledBlocks.push(rawStdout.trim());
  if (reconciledBlocks.length < expectedTotalBlocks) {
    while (reconciledBlocks.length < expectedTotalBlocks)
      reconciledBlocks.push("");
  } else if (reconciledBlocks.length > expectedTotalBlocks) {
    const head = reconciledBlocks.slice(0, expectedTotalBlocks - 1);
    const tail = reconciledBlocks.slice(expectedTotalBlocks - 1).join("\n");
    reconciledBlocks.length = 0;
    reconciledBlocks.push(...head, tail);
  }

  const hasCompileOrRuntimeError =
    Boolean(execResult.stderr?.trim()) ||
    (typeof execResult.exitCode === "number" && execResult.exitCode !== 0);

  let passedCount = 0;
  let failedCaseIndex: number | null = null;
  let offset = 0;
  const details: ExecutionResult["details"] = [];

  const cleanedRuntimeOutput = splitPlainLines(rawStdout).join("\n");

  for (let i = 0; i < normalizedCases.length; i++) {
    const blockCount = expectedBlockCounts[i];
    const caseBlocks = reconciledBlocks
      .slice(offset, offset + blockCount)
      .join("\n");
    offset += blockCount;

    const passed =
      !hasCompileOrRuntimeError &&
      !missingRequiredMarkers &&
      normalizeForCompare(caseBlocks) ===
        normalizeForCompare(normalizedCases[i].output);

    if (passed) {
      passedCount += 1;
    } else if (failedCaseIndex === null) {
      failedCaseIndex = i;
    }

    const visibleOutput =
      hasCompileOrRuntimeError || missingRequiredMarkers
        ? cleanedRuntimeOutput
        : caseBlocks;

    details.push({
      testcaseId: cases[i]?.testcaseId ?? `tc-${i + 1}`,
      input: normalizedCases[i].input,
      passed,
      stdout: visibleOutput,
      expectedOutput: normalizedCases[i].output,
      stderr: hasCompileOrRuntimeError
        ? (execResult.stderr ?? "").trim() || undefined
        : undefined,
      timeMs: execResult.timeMs,
      memoryKb: execResult.memoryKb,
    });
  }

  return {
    passedCount,
    totalTestcases: normalizedCases.length,
    executionTimeMs: execResult.timeMs,
    memoryKb: execResult.memoryKb,
    failedCaseIndex,
    details,
  };
}

export async function runPerformanceTests(
  submission: { language: string; sourceCode: string },
  perfTestCases: Array<{
    name: string;
    inputFileKey: string;
    outputFileKey: string;
  }>,
  constraints: {
    cppTimeLimitMs: number;
    javaTimeLimitMs: number;
    pythonTimeLimitMs: number;
    jsTimeLimitMs: number;
  } | null,
  driver?: { header: string | null; footer: string | null },
): Promise<PerformanceTestResult> {
  const language = normalizeLanguage(submission.language);
  if (!language) {
    throw new SubmissionExecutionError(
      `Unsupported language: ${submission.language}`,
      { status: "INTERNAL_ERROR" },
    );
  }

  const sourceCode = sanitizeSourceCode(
    `${driver?.header ?? ""}\n${submission.sourceCode}\n${driver?.footer ?? ""}`,
  );

  const timeLimitMap: Record<string, number> = {
    c: constraints?.cppTimeLimitMs ?? 1000,
    cpp: constraints?.cppTimeLimitMs ?? 1000,
    java: constraints?.javaTimeLimitMs ?? 2000,
    python: constraints?.pythonTimeLimitMs ?? 4000,
  };
  const effectiveTimeLimit = timeLimitMap[language] ?? 1000;

  const { downloadFromS3 } = await import("../utils/s3");

  const downloaded = await Promise.all(
    perfTestCases.map(async (perfCase) => {
      const [inputContent, expectedOutput] = await Promise.all([
        downloadFromS3(perfCase.inputFileKey),
        downloadFromS3(perfCase.outputFileKey),
      ]);
      return { name: perfCase.name, inputContent, expectedOutput };
    }),
  );

  const testCasesPayload = downloaded.map((d) => ({
    stdin: d.inputContent,
  }));

  const runs = await runCodeBatch({
    language,
    version: "*",
    files: [
      {
        name: language === "java" ? "Main.java" : "main",
        content: sourceCode,
      },
    ],
    test_cases: testCasesPayload,
    stop_on_first_failure: true,
    run_timeout: effectiveTimeLimit + 50,
    compile_timeout: 5000,
  });

  let lastExecutionTimeMs = 0;
  let lastMemoryKb = 0;

  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    if (run.status === "skipped") break;

    const perfCase = downloaded[i];
    lastExecutionTimeMs = toMs(run.cpu_time);
    lastMemoryKb = toKb(run.memory);

    if (lastExecutionTimeMs > effectiveTimeLimit) {
      return {
        status: "BAD_SCALING",
        executionTimeMs: lastExecutionTimeMs,
        memoryKb: lastMemoryKb,
        failedCaseName: perfCase.name,
        passedCount: i,
        totalTestcases: perfTestCases.length,
      };
    }

    const normalizedActual = normalizeForCompare(
      run.stdout ?? run.output ?? "",
    );
    const normalizedExpected = normalizeForCompare(perfCase.expectedOutput);

    if (normalizedActual !== normalizedExpected) {
      return {
        status: "WRONG_ANSWER",
        executionTimeMs: lastExecutionTimeMs,
        memoryKb: lastMemoryKb,
        failedCaseName: perfCase.name,
        passedCount: i,
        totalTestcases: perfTestCases.length,
      };
    }
  }

  return {
    status: "ACCEPTED",
    executionTimeMs: lastExecutionTimeMs,
    memoryKb: lastMemoryKb,
    passedCount: perfTestCases.length,
    totalTestcases: perfTestCases.length,
  };
}

export async function executeCode(
  request: ExecuteCodeRequest,
): Promise<ExecuteCodeResponse> {
  return runCode(request);
}
