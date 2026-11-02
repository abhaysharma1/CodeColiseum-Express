import { randomBytes } from "node:crypto";
import {
  ProgrammingLanguage,
} from "../../../generated/prisma/enums";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import { resolveLanguageFromInput } from "@/utils/languageCatalog";
import type { BulkSignupResultRow, JudgeResponse } from "./admin.types";

const caseDelimiterTokens = [
  "__CASE_START__",
  "__CASE_END__",
  "CASE_START_MARKER",
  "CASE_END_MARKER",
  "_CASE_START_",
  "_CASE_END_",
];

export function normalizeOutput(value?: string | null): string {
  return (value ?? "").replace(/\r\n/g, "\n").trimEnd();
}

/**
 * Removes the synthetic case boundaries that the problem editor injects into
 * exported test cases so the judge only receives the real payload.
 */
export function stripCaseDelimiters(value?: string | null): string {
  const normalized = (value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !caseDelimiterTokens.includes(line))
    .join("\n")
    .trim();
}

export function isProgrammingLanguage(
  value: string,
): value is ProgrammingLanguage {
  return (Object.values(ProgrammingLanguage) as string[]).includes(value);
}

/**
 * Resolves the language from either the legacy `language` string or a runtime
 * `languageId`. Returns `null` when the input is not a supported language.
 */
export function normalizeProgrammingLanguage(input: {
  language?: unknown;
  languageId?: unknown;
}): ProgrammingLanguage | null {
  const resolved = resolveLanguageFromInput(input);

  if (!resolved) {
    return null;
  }

  return isProgrammingLanguage(resolved) ? resolved : null;
}

export interface ComplexityRange {
  min: number;
  max: number;
  idx: number;
}

export const COMPLEXITY_RANGES: Record<string, ComplexityRange> = {
  LOGN: { min: 0, max: 1.3, idx: 0 },
  N: { min: 1.3, max: 1.8, idx: 1 },
  NLOGN: { min: 1.8, max: 2.6, idx: 2 },
  N2: { min: 2.6, max: 4.5, idx: 3 },
  N3: { min: 4.5, max: 7.5, idx: 4 },
  EXP: { min: 7.5, max: Infinity, idx: 5 },
};

export interface ComplexityClassification {
  complexity: string;
  avgRatio?: number;
  r1?: number;
  r2?: number;
  reason?: string;
}

/**
 * Derives the runtime complexity from the growth ratio between three
 * progressively larger inputs. High variance between the two ratios is treated
 * as noise rather than a real measurement.
 */
export function classifyComplexity(
  r1: number,
  r2: number,
): ComplexityClassification {
  if (Math.abs(r1 - r2) / Math.max(r1, r2) > 0.4) {
    return {
      complexity: "UNSTABLE",
      reason: "High runtime variance / noise",
    };
  }

  const avg = (r1 + r2) / 2;

  for (const [name, { min, max }] of Object.entries(COMPLEXITY_RANGES)) {
    if (avg >= min && avg < max) {
      return {
        complexity: name,
        avgRatio: avg,
        r1,
        r2,
      };
    }
  }

  return {
    complexity: "UNKNOWN",
    avgRatio: avg,
    r1,
    r2,
  };
}

export function resolveGlobalRoleId(input: { roleId?: string }): string {
  if (input.roleId) {
    return input.roleId;
  }

  return GLOBAL_ROLE_IDS.ORG_STUDENT;
}

const passwordAlphabet =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%";

export function generateRandomPassword(length = 12): string {
  const bytes = randomBytes(length);
  let result = "";

  for (let i = 0; i < length; i++) {
    result += passwordAlphabet[bytes[i] % passwordAlphabet.length];
  }

  return result;
}

/**
 * Normalizes a client-supplied download name so it cannot escape the S3 prefix.
 */
export function sanitizeCsvFilename(filename?: unknown): string {
  const finalName =
    typeof filename === "string" && filename.trim()
      ? filename
          .trim()
          .replace(/[/\\:*?"<>|]/g, "_")
          .replace(/\.{2,}/g, ".")
      : `bulk_signup_passwords_${Date.now()}`;

  return finalName.endsWith(".csv") ? finalName : `${finalName}.csv`;
}

export function buildPasswordsCsv(results: BulkSignupResultRow[]): string {
  const rows = results
    .filter((row) => row.result === "created")
    .map((row) => `${row.email},${row.password}`)
    .join("\n");

  return `Email,Password\n${rows}`;
}

export interface StudentSignupRow {
  email: string;
  name: string;
  rollNumber: string;
  branch: string | null;
  semester: number | null;
  batch: string | null;
}

export interface TeacherSignupRow {
  email: string;
  name: string;
  employeeId: string | null;
  department: string | null;
}

function toTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseStudentSignupRow(
  raw: Record<string, unknown>,
): StudentSignupRow {
  return {
    name: toTrimmedString(raw.Name),
    email: toTrimmedString(raw.Email).toLowerCase(),
    rollNumber: toTrimmedString(raw["Roll Number"]),
    branch: raw.Branch ? toTrimmedString(raw.Branch) : null,
    semester: raw.Semester ? Number(raw.Semester) : null,
    batch: raw.Batch ? toTrimmedString(raw.Batch) : null,
  };
}

export function parseTeacherSignupRow(
  raw: Record<string, unknown>,
): TeacherSignupRow {
  return {
    name: toTrimmedString(raw.Name),
    email: toTrimmedString(raw.Email).toLowerCase(),
    employeeId: toTrimmedString(raw["Employee ID"]) || null,
    department: raw.Department ? toTrimmedString(raw.Department) : null,
  };
}

export interface CredentialRow {
  lineNumber: number;
  email: string;
  password: string;
}

/**
 * Parses the two-column (`Email,Password`) CSV produced by the bulk signup
 * flow. The header line is always skipped, matching the legacy behaviour.
 */
export function parseCredentialsCsv(csvText: string): CredentialRow[] {
  const lines = csvText.trim().split("\n");
  const rows: CredentialRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    rows.push({
      lineNumber: i + 1,
      email: (parts[0] ?? "").trim().toLowerCase(),
      password: (parts[1] ?? "").trim(),
    });
  }

  return rows;
}

export function toJudgeLikeResponse(input: {
  result: {
    stdout: string;
    stderr?: string;
    exitCode?: number | null;
    signal?: string | null;
    compileError?: { stderr?: string; signal?: string | null };
  };
  stdin: string;
  expectedOutput: string;
}): JudgeResponse {
  const { result, stdin, expectedOutput } = input;
  const cleanStdin = stripCaseDelimiters(stdin);
  const cleanExpectedOutput = stripCaseDelimiters(expectedOutput);

  if (result.compileError) {
    return {
      stdout: null,
      stderr: result.compileError.stderr || null,
      compile_output: result.compileError.stderr || null,
      message: result.compileError.signal || null,
      status: { id: 6, description: "Compilation Error" },
      time: "0",
      memory: 0,
      token: "",
      stdin: cleanStdin,
      expected_output: cleanExpectedOutput,
    };
  }

  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    return {
      stdout: result.stdout || null,
      stderr: result.stderr || null,
      compile_output: null,
      message: result.signal || null,
      status: { id: 11, description: "Runtime Error" },
      time: "0",
      memory: 0,
      token: "",
      stdin: cleanStdin,
      expected_output: cleanExpectedOutput,
    };
  }

  const actual = normalizeOutput(result.stdout || "");
  const expected = normalizeOutput(cleanExpectedOutput);
  const accepted = actual === expected;

  return {
    stdout: result.stdout || null,
    stderr: result.stderr || null,
    compile_output: null,
    message: null,
    status: {
      id: accepted ? 3 : 4,
      description: accepted ? "Accepted" : "Wrong Answer",
    },
    time: "0",
    memory: 0,
    token: "",
    stdin: cleanStdin,
    expected_output: cleanExpectedOutput,
  };
}
