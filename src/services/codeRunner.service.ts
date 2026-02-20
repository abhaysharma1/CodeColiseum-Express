import { Request } from "express";
import prisma from "../utils/prisma";
import { auth } from "../utils/auth";
import { fromNodeHeaders } from "better-auth/node";

/* ----------------------------- Types ----------------------------- */

interface TestCase {
  input: string;
  output: string;
}

interface JudgeStatus {
  id: number;
  description: string;
}

interface JudgeResponse {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string;
  memory: number;
  token: string;
  status: JudgeStatus;
}

interface Judge0Raw extends Omit<
  JudgeResponse,
  "stdout" | "stderr" | "compile_output" | "message"
> {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
}

/* -------------------------- Base64 utils -------------------------- */

const encodeBase64 = (value?: string | null): string | null =>
  value ? Buffer.from(value, "utf8").toString("base64") : null;

const decodeBase64 = (value?: string | null): string | null => {
  if (!value) return null;
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return value;
  }
};

const reconstructJudge0Response = (raw: Judge0Raw): JudgeResponse => ({
  ...raw,
  stdout: decodeBase64(raw.stdout),
  stderr: decodeBase64(raw.stderr),
  compile_output: decodeBase64(raw.compile_output),
  message: decodeBase64(raw.message),
});

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
  languageId: number;
  code: string;
}

export interface RunCodeResponse {
  responses: JudgeResponse[];
  cases: TestCase[];
}

/* ----------------------------- Service ----------------------------- */

export async function runCodeService(
  req: Request,
  { questionId, languageId, code }: RunCodeRequest
): Promise<RunCodeResponse> {
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
      languageId_problemId: {
        languageId: languageId,
        problemId: problem.id,
      },
    },
  });

  const finalCode = sanitizeSourceCode(
    `${driver?.header ?? ""}\n${code}\n${driver?.footer ?? ""}`,
  );

  /* ----------------------- Judge0 submit ----------------------- */

  const submissions = cases.map((tc) => ({
    language_id: languageId,
    source_code: encodeBase64(finalCode),
    stdin: encodeBase64(tc.input),
    expected_output: encodeBase64(tc.output),
  }));

  const JUDGE0_DOMAIN = process.env.JUDGE0_DOMAIN;
  const API_KEY = process.env.JUDGE0_API_KEY;

  if (!JUDGE0_DOMAIN || !API_KEY) {
    throw new Error("Judge0 environment variables missing");
  }

  const batchResponse = await fetch(
    `${JUDGE0_DOMAIN}/submissions/batch?base64_encoded=true&wait=false&fields=*`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH_TOKEN': API_KEY,
      },
      body: JSON.stringify({ submissions }),
    }
  );

  if (!batchResponse.ok) {
    throw new Error("Failed to submit to Judge0");
  }

  const batchData = await batchResponse.json();
  const tokens: string[] = batchData.map((s: any) => s.token);

  /* --------------------------- Poll --------------------------- */

  const poll = async (token: string): Promise<JudgeResponse> => {
    for (let i = 0; i < 30; i++) {
      const response = await fetch(
        `${JUDGE0_DOMAIN}/submissions/${token}?base64_encoded=true&fields=*`,
        {
          headers: {
            'X-AUTH_TOKEN': API_KEY,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get submission status for token ${token}`);
      }

      const raw = await response.json();
      const decoded = reconstructJudge0Response(raw);

      if (decoded.status.id > 2) return decoded;

      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error(`Submission ${token} timed out`);
  };

  const responses = await Promise.all(tokens.map(poll));

  return { responses, cases };
}