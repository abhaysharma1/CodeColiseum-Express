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

const CASE_START_MARKER = "__CASE_START__";
const CASE_END_MARKER = "__CASE_END__";

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
  const pattern = new RegExp(
    `${CASE_START_MARKER}[\\s\\S]*?${CASE_END_MARKER}`,
    "g",
  );
  return (content.match(pattern) ?? []).map((block) => block.trim());
};

const buildAggregatedInput = (cases: TestCase[]): string => {
  let totalCaseCount = 0;
  const bodyParts: string[] = [];

  for (const testCase of cases) {
    const input = (testCase.input ?? "").trim();
    const newlineIndex = input.indexOf("\n");
    const head = newlineIndex === -1 ? input : input.slice(0, newlineIndex);
    const body = newlineIndex === -1 ? "" : input.slice(newlineIndex + 1).trim();
    const count = Number.parseInt(head.trim(), 10);

    if (!Number.isFinite(count) || count < 0) {
      return cases.map((entry) => (entry.input ?? "").trim()).join("\n");
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
  baseURL: process.env.PISTON_URL || "http://piston.internal:2000",
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

  const cases: TestCase[] =
    typeof runTestCase.cases === "string"
      ? JSON.parse(runTestCase.cases)
      : runTestCase.cases;

  if (!Array.isArray(cases) || cases.length === 0) {
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

  const finalCode = sanitizeSourceCode(
    `${driver?.header ?? ""}\n${code}\n${driver?.footer ?? ""}`,
  );

  const pistonExecuteUrl = getPistonExecuteUrl();
  const payload: PistonExecuteRequest = {
    language: pistonLanguage.language,
    version: pistonLanguage.version,
    files: [{ content: finalCode }],
    stdin: buildAggregatedInput(cases),
  };

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

  const allBlocks = extractMarkedBlocks(execution.run.stdout ?? "");
  const expectedBlockCounts = cases.map(
    (testCase) => extractMarkedBlocks(testCase.output ?? "").length,
  );
  const expectedTotalBlocks = expectedBlockCounts.reduce(
    (sum, count) => sum + count,
    0,
  );

  if (expectedTotalBlocks !== allBlocks.length) {
    const error = new Error(
      `Execution output format mismatch: expected ${expectedTotalBlocks} case blocks, received ${allBlocks.length}`,
    );
    (error as any).status = 502;
    throw error;
  }

  const responses: PistonExecutionResult[] = [];
  let offset = 0;

  for (let i = 0; i < cases.length; i++) {
    const blockCount = expectedBlockCounts[i];
    const caseBlocks = allBlocks.slice(offset, offset + blockCount).join("\n");
    offset += blockCount;

    responses.push({
      ...execution,
      run: {
        ...execution.run,
        stdout: caseBlocks,
        output: caseBlocks,
      },
    });
  }

  return { responses, cases };
}
