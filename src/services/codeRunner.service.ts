import { Request } from "express";
import prisma from "../utils/prisma";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
import axios from "axios";
import http from "node:http";
import {
  fromRuntimeLanguageId,
  type LanguageKey,
} from "@/utils/languageCatalog";
import CacheableLookup from "cacheable-lookup";

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

interface PistonFile {
  name?: string;
  content: string;
}

interface PistonExecuteRequest {
  language: string;
  version: string;
  files: PistonFile[];
  stdin: string;
}

interface PistonLanguageConfig {
  language: string;
  version: string;
}

interface RunCaseResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
}

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

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pistonLanguageMap: Record<LanguageKey, PistonLanguageConfig> = {
  c: { language: "c", version: "*" },
  cpp: { language: "cpp", version: "*" },
  python: { language: "python", version: "*" },
  java: { language: "java", version: "*" },
};

const normalizeLanguage = (languageId?: number) =>
  fromRuntimeLanguageId(languageId);

const resolvePistonLanguage = (
  language?: LanguageKey | null,
): PistonLanguageConfig | null => {
  if (!language) {
    return null;
  }

  return pistonLanguageMap[language] ?? null;
};

const getPistonExecuteUrl = (): string => {
  const pistonUri = process.env.PISTON_URI?.trim();

  if (!pistonUri) {
    const error = new Error("PISTON_URI environment variable is missing");
    (error as any).status = 500;
    throw error;
  }

  return `${pistonUri.replace(/\/+$/, "")}/api/v2/execute`;
};

const extractMarkedBlocks = (content: string): string[] => {
  const escapedStarts = caseStartMarkers.map(escapeRegex);
  const escapedEnds = caseEndMarkers.map(escapeRegex);
  const pattern = new RegExp(
    `(?:${escapedStarts.join("|")})[\\s\\S]*?(?:${escapedEnds.join("|")})`,
    "g",
  );

  return (content.match(pattern) ?? []).map((block) => block.trim());
};

const stripBlockMarkers = (block: string): string =>
  allCaseMarkers
    .reduce(
      (cleaned, marker) =>
        cleaned.replace(new RegExp(escapeRegex(marker), "g"), ""),
      block,
    )
    .trim();

const stripCaseDelimiters = (content: string): string => {
  let normalized = (content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (const marker of allCaseMarkers) {
    normalized = normalized.replace(
      new RegExp(`^\\s*${escapeRegex(marker)}\\s*$`, "gm"),
      "",
    );
  }

  return normalized.trim();
};

const parseCaseCountFromInput = (input: string): number | null => {
  const firstLine = stripCaseDelimiters(input ?? "")
    .split("\n")[0]
    ?.trim();

  if (!firstLine) {
    return null;
  }

  const count = Number.parseInt(firstLine, 10);
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }

  return count;
};

const splitPlainLines = (content: string): string[] => {
  const normalized = stripCaseDelimiters(content ?? "");

  if (!normalized) {
    return [];
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const normalizeInputBlock = (content: string): string =>
  stripCaseDelimiters(content ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

const getOutputBlocks = (
  content: string,
  expectedLineCount?: number | null,
): string[] => {
  const markedBlocks = extractMarkedBlocks(content);

  if (markedBlocks.length > 0) {
    return markedBlocks.map(stripBlockMarkers);
  }

  const lines = splitPlainLines(content);
  if (
    expectedLineCount &&
    expectedLineCount > 1 &&
    lines.length === expectedLineCount
  ) {
    return lines;
  }

  return [lines.join("\n")];
};

const getMarkedOutputBlocksStrict = (content: string): string[] => {
  const markedBlocks = extractMarkedBlocks(content);
  if (markedBlocks.length === 0) {
    return [];
  }

  return markedBlocks.map(stripBlockMarkers);
};

const buildAggregatedInput = (cases: TestCase[]): string => {
  let totalCaseCount = 0;
  const bodyParts: string[] = [];

  for (const testCase of cases) {
    const input = normalizeInputBlock(testCase.input ?? "");
    const newlineIndex = input.indexOf("\n");
    const head = newlineIndex === -1 ? input : input.slice(0, newlineIndex);
    const body =
      newlineIndex === -1 ? "" : input.slice(newlineIndex + 1).trim();
    const count = Number.parseInt(head.trim(), 10);

    if (!Number.isFinite(count) || count < 0) {
      return cases
        .map((entry) => normalizeInputBlock(entry.input ?? ""))
        .join("\n");
    }

    totalCaseCount += count;
    if (body) {
      bodyParts.push(body);
    }
  }

  if (totalCaseCount === 0) {
    return "0";
  }

  return `${totalCaseCount}\n${bodyParts.join("\n")}`.trim();
};

const splitAggregatedInputCases = (
  input: string,
  expectedCount: number,
): string[] => {
  const cleanedInput = stripCaseDelimiters(input ?? "");
  const lines = cleanedInput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const declaredCount = Number.parseInt(lines[0], 10);
  const remaining = lines.slice(1);
  const targetCount =
    Number.isFinite(declaredCount) && declaredCount > 0
      ? declaredCount
      : expectedCount;

  if (targetCount <= 0 || remaining.length === 0) {
    return [];
  }

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
};

const getInputBlocks = (input: string, expectedCount: number): string[] => {
  const markedBlocks = extractMarkedBlocks(input ?? "");

  if (markedBlocks.length > 0) {
    return markedBlocks.map(stripBlockMarkers);
  }

  return splitAggregatedInputCases(input, expectedCount);
};

const normalizeForCompare = (value: string): string =>
  splitPlainLines(value ?? "").join("\n");

export function sanitizeSourceCode(code: string): string {
  return (
    code
      // Replace non-breaking spaces with normal spaces
      .replace(/\u00A0/g, " ")

      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, "")

      // Normalize smart quotes (just in case)
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")

      // Normalize line endings
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
  );
}

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

const cacheable = new CacheableLookup();

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  keepAliveMsecs: 1000,
});

cacheable.install(httpAgent);

export const piston = axios.create({
  baseURL: process.env.PISTON_URI || "http://piston.internal:2000",
  httpAgent,
  timeout: 10000,
});

export async function runCodeService(
  req: Request,
  { questionId, languageId, code }: RunCodeRequest,
): Promise<RunCodeResponse> {
  const normalizedLanguage = normalizeLanguage(languageId);
  const pistonLanguage = resolvePistonLanguage(normalizedLanguage);

  if (!normalizedLanguage || !pistonLanguage) {
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

  const sanitizedCases = cases.map((testCase) => ({
    ...testCase,
    input: stripCaseDelimiters(testCase.input ?? ""),
    // Keep expected output markers so block extraction can preserve case boundaries.
    output: (testCase.output ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
  }));

  const expectedUsesMarkers = sanitizedCases.some(
    (testCase) => extractMarkedBlocks(testCase.output ?? "").length > 0,
  );

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

  const finalCode = sanitizeSourceCode(
    `${driver?.header ?? ""}\n${code}\n${driver?.footer ?? ""}`,
  );

  let payload: PistonExecuteRequest;
  const pistonExecuteUrl = getPistonExecuteUrl();

  if (languageId == 4) {
    payload = {
      language: pistonLanguage.language,
      version: pistonLanguage.version,
      files: [{ name: "Main.java", content: finalCode }],
      stdin: buildAggregatedInput(sanitizedCases),
    };
  } else {
    payload = {
      language: pistonLanguage.language,
      version: pistonLanguage.version,
      files: [{ content: finalCode }],
      stdin: buildAggregatedInput(sanitizedCases),
    };
  }

  let execution: PistonExecutionResult;

  try {
    const result = await piston.post<PistonExecutionResult>(
      pistonExecuteUrl,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    execution = result.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const details =
        typeof error.response?.data === "string"
          ? error.response.data
          : JSON.stringify(error.response?.data ?? {});
      const executeError = new Error(
        `Piston execution failed: ${error.message}. ${details}`,
      );
      (executeError as any).status = 502;
      throw executeError;
    }

    throw error;
  }

  const expectedLineCountHints =
    sanitizedCases.length === 1
      ? [parseCaseCountFromInput(sanitizedCases[0]?.input ?? "")]
      : sanitizedCases.map(() => null);

  const expectedBlocksByCase = sanitizedCases.map((testCase, index) =>
    getOutputBlocks(testCase.output ?? "", expectedLineCountHints[index]),
  );
  const shouldExpandAggregatedCase =
    sanitizedCases.length === 1 && expectedBlocksByCase[0]?.length > 1;
  const expandedInputs = shouldExpandAggregatedCase
    ? getInputBlocks(
        cases[0]?.input ?? "",
        expectedBlocksByCase[0].length,
      )
    : [];

  const normalizedCases = shouldExpandAggregatedCase
    ? expectedBlocksByCase[0].map((block, index) => ({
        input: expandedInputs[index] || `Case ${index + 1}`,
        output: block,
      }))
    : sanitizedCases.map((testCase, index) => {
        const blocks = expectedBlocksByCase[index];

        return {
          ...testCase,
          output: blocks.join("\n"),
        };
      });

  const expectedBlockCounts = shouldExpandAggregatedCase
    ? expectedBlocksByCase[0].map(() => 1)
    : expectedBlocksByCase.map((blocks) => Math.max(blocks.length, 1));
  const expectedTotalBlocks = expectedBlockCounts.reduce(
    (sum, count) => sum + count,
    0,
  );

  const rawStdout = execution.run.stdout ?? execution.run.output ?? "";

  const allBlocks = expectedUsesMarkers
    ? getMarkedOutputBlocksStrict(rawStdout)
    : getOutputBlocks(rawStdout, expectedTotalBlocks);
  const missingRequiredMarkers = expectedUsesMarkers && allBlocks.length === 0;
  const reconciledBlocks = [...allBlocks];

  if (reconciledBlocks.length === 0) {
    reconciledBlocks.push(rawStdout.trim());
  }

  if (reconciledBlocks.length < expectedTotalBlocks) {
    while (reconciledBlocks.length < expectedTotalBlocks) {
      reconciledBlocks.push("");
    }
  } else if (reconciledBlocks.length > expectedTotalBlocks) {
    const head = reconciledBlocks.slice(0, expectedTotalBlocks - 1);
    const tail = reconciledBlocks.slice(expectedTotalBlocks - 1).join("\n");
    reconciledBlocks.length = 0;
    reconciledBlocks.push(...head, tail);
  }

  const responses: PistonExecutionResult[] = [];
  const results: RunCaseResult[] = [];
  let passedCount = 0;
  let offset = 0;
  const hasCompileOrRuntimeError =
    Boolean(execution.compile?.stderr?.trim()) ||
    Boolean(execution.run.stderr?.trim()) ||
    (typeof execution.run.code === "number" && execution.run.code !== 0);
  const cleanedRuntimeOutput = splitPlainLines(
    execution.run.stdout ?? execution.run.output ?? "",
  ).join("\n");

  for (let i = 0; i < normalizedCases.length; i++) {
    const blockCount = expectedBlockCounts[i];
    const caseBlocks = reconciledBlocks
      .slice(offset, offset + blockCount)
      .join("\n");
    offset += blockCount;
    const expectedOutput = normalizedCases[i]?.output ?? "";
    const passed =
      !hasCompileOrRuntimeError &&
      !missingRequiredMarkers &&
      normalizeForCompare(caseBlocks) === normalizeForCompare(expectedOutput);
    if (passed) {
      passedCount += 1;
    }

    const visibleOutput = hasCompileOrRuntimeError || missingRequiredMarkers
      ? cleanedRuntimeOutput
      : caseBlocks;

    responses.push({
      ...execution,
      run: {
        ...execution.run,
        stdout: visibleOutput,
        output: visibleOutput,
      },
    });

    results.push({
      input: normalizedCases[i]?.input ?? "",
      expectedOutput,
      actualOutput: visibleOutput,
      passed,
    });
  }

  return {
    responses,
    cases: normalizedCases,
    results,
    passedCount,
    totalCount: normalizedCases.length,
  };
}
