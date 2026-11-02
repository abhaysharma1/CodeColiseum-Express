import type { IncomingHttpHeaders } from "node:http";
import XLSX from "xlsx";
import { hashPassword } from "better-auth/crypto";
import { logger } from "@/config/logger";
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import { GLOBAL_ROLE_IDS, GROUP_ROLE_IDS } from "@/permissions/role.constants";
import { auth } from "@/utils/auth";
import { transporter } from "@/utils/nodemailer";
import {
  deleteFromS3,
  getBulkSignupBucket,
  uploadToS3,
} from "@/utils/s3";
import { analyzeRuntime } from "@/services/runtimeAnalyzer.service";
import { runRawCodeService } from "@/services/runReferenceSolution.service";
import {
  executeCode,
  executeSubmission,
  SubmissionExecutionError,
} from "@/services/codeExecutor.service";
import type { NormalizedTestcase } from "@/services/types";
import { ProgrammingLanguage } from "../../../generated/prisma/enums";
import * as adminRepository from "./admin.repository";
import {
  buildStudentCredentialsEmail,
  buildTeacherCredentialsEmail,
} from "./admin.email.templates";
import {
  buildPasswordsCsv,
  classifyComplexity,
  COMPLEXITY_RANGES,
  generateRandomPassword,
  normalizeProgrammingLanguage,
  parseCredentialsCsv,
  parseStudentSignupRow,
  parseTeacherSignupRow,
  resolveGlobalRoleId,
  sanitizeCsvFilename,
  stripCaseDelimiters,
  toJudgeLikeResponse,
} from "./admin.helpers";
import type {
  AdminAssignRoleInput,
  AdminProblemsQuery,
  AdminResetPasswordInput,
  AdminSingleSignUpInput,
  BulkProblemInput,
  BulkSignUpInput,
  BulkSignupCsvInput,
  BulkSignupMetaInput,
  CreatePerformanceTestCaseInput,
  DriverCodeInput,
  PerformanceConstraintsInput,
  ProblemEditorInput,
  RunReferenceSolutionInput,
  ValidateComplexityInput,
} from "./admin.schema";
import type {
  BulkProblemResult,
  BulkSignupResultRow,
  ComplexityValidationOutcome,
  CredentialsEmailResultRow,
  JudgeResponse,
} from "./admin.types";

/* ----------------------------- Driver code ----------------------------- */

export async function saveDriverCode(input: DriverCodeInput) {
  const language = normalizeProgrammingLanguage({
    language: input.language,
    languageId: input.languageId,
  });

  if (!language) {
    throw new ValidationError("Unsupported language");
  }

  const problem = await adminRepository.findProblemById(input.problemId);

  if (!problem) {
    throw new NotFoundError("Couldn't find Problem");
  }

  await adminRepository.deleteDriverCodeForLanguage(input.problemId, language);

  return adminRepository.createDriverCode({
    problemId: input.problemId,
    language,
    header: input.header,
    template: input.template,
    footer: input.footer,
  });
}

/* ------------------------- Performance limits ------------------------- */

export function getPerformanceConstraints(problemId: string) {
  return adminRepository.findPerformanceConstraints(problemId);
}

export function savePerformanceConstraints(
  input: PerformanceConstraintsInput,
) {
  return adminRepository.upsertPerformanceConstraints(input);
}

export async function removePerformanceConstraints(problemId: string) {
  const existing =
    await adminRepository.findPerformanceConstraints(problemId);

  if (!existing) {
    throw new NotFoundError("No constraints found for this problem");
  }

  await adminRepository.deletePerformanceConstraints(problemId);
}

/* ------------------------ Performance test cases ----------------------- */

export function listPerformanceTestCases(problemId: string) {
  return adminRepository.findPerformanceTestCases(problemId);
}

export async function addPerformanceTestCase(
  input: CreatePerformanceTestCaseInput & {
    inputBuffer: Buffer;
    outputBuffer: Buffer;
  },
) {
  const testCaseId = crypto.randomUUID();
  const inputFileKey = `perf-tests/${input.problemId}/${testCaseId}-input.txt`;
  const outputFileKey = `perf-tests/${input.problemId}/${testCaseId}-output.txt`;

  await uploadToS3(inputFileKey, input.inputBuffer);
  await uploadToS3(outputFileKey, input.outputBuffer);

  return adminRepository.createPerformanceTestCase({
    problemId: input.problemId,
    name: input.name,
    inputFileKey,
    outputFileKey,
  });
}

export async function removePerformanceTestCase(id: string) {
  const existing =
    await adminRepository.findPerformanceTestCaseById(id);

  if (!existing) {
    throw new NotFoundError("Performance test case not found");
  }

  await deleteFromS3(existing.inputFileKey);
  await deleteFromS3(existing.outputFileKey);

  await adminRepository.deletePerformanceTestCase(id);
}

/* --------------------------- Bulk import ------------------------------- */

export async function importProblems(
  problems: BulkProblemInput[],
): Promise<BulkProblemResult[]> {
  let nextNumber = (await adminRepository.findMaxProblemNumber()) + 1;
  const results: BulkProblemResult[] = [];

  for (const problem of problems) {
    const assignedNumber = nextNumber++;

    try {
      const referenceLanguage = normalizeProgrammingLanguage({
        language: problem.referenceSolution.language,
        languageId: problem.referenceSolution.languageId,
      });

      if (!referenceLanguage) {
        throw new ValidationError("Unsupported reference solution language");
      }

      await adminRepository.createImportedProblem({
        number: assignedNumber,
        problem,
        referenceLanguage,
      });

      results.push({
        title: problem.title,
        result: "created",
        number: assignedNumber,
      });
    } catch (error) {
      logger.warn("admin problem import failed", {
        title: problem.title,
        error: error instanceof Error ? error.message : "unknown error",
      });

      results.push({
        title: problem.title,
        result: "error",
        message: "Couldn't Upload this Problem",
      });
    }
  }

  return results;
}

/* ----------------------- Complexity validation ------------------------- */

export async function validateComplexity(
  input: ValidateComplexityInput,
): Promise<ComplexityValidationOutcome> {
  const problem = await adminRepository.findProblemWithReferenceSolutions(
    input.problemId,
  );

  if (!problem) {
    throw new ValidationError("Couldn't find problem");
  }

  const referenceCode = problem.referenceSolutions[0];

  if (!referenceCode) {
    throw new InternalServerError("Couldn't find reference code");
  }

  const { expectedComplexity, cases } = input.casesData;
  const results: JudgeResponse[] = [];

  for (let i = 0; i < cases.length; i++) {
    const cleanInput = stripCaseDelimiters(cases[i].input);
    const cleanOutput = stripCaseDelimiters(cases[i].output);

    try {
      const execResponse = await executeCode({
        language: referenceCode.language,
        version: "*",
        files: [{ content: referenceCode.code }],
        stdin: cleanInput,
        run_timeout: 10000,
        compile_timeout: 10000,
      });

      results[i] = toJudgeLikeResponse({
        result: execResponse,
        stdin: cleanInput,
        expectedOutput: cleanOutput,
      });
    } catch (error) {
      logger.warn("complexity case execution failed", {
        problemId: input.problemId,
        error: error instanceof Error ? error.message : "unknown error",
      });
      throw new InternalServerError("Please Run the Validation Again");
    }
  }

  const t1 = Number(results[0].time);
  const t2 = Number(results[1].time);
  const t3 = Number(results[2].time);

  const r1 = t2 / t1;
  const r2 = t3 / t2;

  const { complexity, avgRatio } = classifyComplexity(r1, r2);

  if (complexity === "UNSTABLE" || complexity === "UNKNOWN") {
    throw new InternalServerError("Please Run the Validation Again");
  }

  const detectedIndex = COMPLEXITY_RANGES[complexity].idx;
  const expectedIndex = COMPLEXITY_RANGES[expectedComplexity].idx;

  return {
    passed: detectedIndex <= expectedIndex,
    expectedComplexity,
    yourComplexity: complexity,
    ratio: avgRatio ?? 0,
  };
}

/* -------------------------- Problem validation ------------------------- */

export interface ProblemValidationResult {
  responses: JudgeResponse[];
  cases: { input: string; output: string }[];
}

export async function validateProblem(
  problems: BulkProblemInput[],
): Promise<ProblemValidationResult> {
  const firstProblem = problems[0];
  const cases = JSON.parse(
    JSON.stringify([
      ...firstProblem.publicTests,
      ...firstProblem.hiddenTests,
    ]),
  ) as { input?: unknown; output?: unknown }[];

  const language = normalizeProgrammingLanguage({
    language: firstProblem.referenceSolution.language,
    languageId: firstProblem.referenceSolution.languageId,
  });

  if (!language) {
    throw new ValidationError("Unsupported language");
  }

  const normalizedTestcases: NormalizedTestcase[] = cases.map(
    (testCase, index) => ({
      testcaseId: `tc-${index + 1}`,
      input: typeof testCase.input === "string" ? testCase.input : "",
      expectedOutput:
        typeof testCase.output === "string" ? testCase.output : "",
    }),
  );

  const casesPayload = normalizedTestcases.map((testCase) => ({
    input: testCase.input,
    output: testCase.expectedOutput,
  }));

  try {
    const execResult = await executeSubmission(
      { language, sourceCode: firstProblem.referenceSolution.code },
      normalizedTestcases,
    );

    const responses: JudgeResponse[] = execResult.details.map((detail) => ({
      stdout: detail.stdout || null,
      stderr: detail.stderr || null,
      compile_output: null,
      message: null,
      status: {
        id: detail.passed ? 3 : 4,
        description: detail.passed ? "Accepted" : "Wrong Answer",
      },
      time: String(detail.timeMs),
      memory: detail.memoryKb,
      token: "",
      stdin: detail.input,
      expected_output: detail.expectedOutput,
    }));

    return { responses, cases: casesPayload };
  } catch (error) {
    if (
      error instanceof SubmissionExecutionError &&
      error.context?.status === "COMPILE_ERROR"
    ) {
      const responses: JudgeResponse[] = normalizedTestcases.map(
        (testCase) => ({
          stdout: null,
          stderr: error.context.stderr || null,
          compile_output: error.context.stderr || null,
          message: null,
          status: { id: 6, description: "Compilation Error" },
          time: "0",
          memory: 0,
          token: "",
          stdin: stripCaseDelimiters(testCase.input),
          expected_output: stripCaseDelimiters(testCase.expectedOutput),
        }),
      );

      return { responses, cases: casesPayload };
    }

    throw error;
  }
}

/* ------------------------------- Accounts ------------------------------ */

export interface BulkSignUpResult {
  success: boolean;
  results: Omit<BulkSignupResultRow, "name" | "password">[];
}

export async function bulkSignUp(
  input: BulkSignUpInput,
): Promise<BulkSignUpResult> {
  const globalRoleId = resolveGlobalRoleId({ roleId: input.roleId });
  const results: BulkSignUpResult["results"] = [];

  for (const email of input.emails) {
    // Legacy convention: the local part of the email doubles as the initial
    // password. The response never echoes the password back to the caller.
    const password = email.split("@")[0];
    const name = password;

    try {
      await auth.api.signUpEmail({
        body: { email, password, name },
        headers: new Headers(),
      });

      await adminRepository.activateUserByEmail(email, globalRoleId);

      results.push({ email, result: "created" });
    } catch (error) {
      results.push({
        email,
        result: "error",
        message: extractAuthErrorMessage(error, "Failed to create account"),
      });
    }
  }

  return {
    success: results.every((row) => row.result === "created"),
    results,
  };
}

function extractAuthErrorMessage(error: unknown, fallback: string): string {
  const withBody = error as { body?: { message?: string }; message?: string };
  return withBody?.body?.message ?? withBody?.message ?? fallback;
}

export async function singleSignUp(input: AdminSingleSignUpInput) {
  const globalRoleId = resolveGlobalRoleId({ roleId: input.roleId });
  const normalizedEmail = input.email.toLowerCase();

  try {
    await auth.api.signUpEmail({
      body: {
        email: normalizedEmail,
        password: input.password,
        name: input.name,
      },
      headers: new Headers(),
    });
  } catch (error) {
    const message = extractAuthErrorMessage(
      error,
      "Failed to create account",
    );

    if (/already exists|another email/i.test(message)) {
      throw new ConflictError("User already exists", { message });
    }

    throw new ValidationError("Failed to create account", { message });
  }

  return adminRepository.activateUserByEmailWithSummary(
    normalizedEmail,
    globalRoleId,
  );
}

export async function assignUserRole(input: AdminAssignRoleInput) {
  const normalizedEmail = input.email.toLowerCase();
  const globalRoleId = resolveGlobalRoleId({ roleId: input.roleId });

  const user = await adminRepository.findUserIdByEmail(normalizedEmail);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return adminRepository.updateUserGlobalRole(user.id, globalRoleId);
}

export async function resetUserPasswordByEmail(
  input: AdminResetPasswordInput,
) {
  const normalizedEmail = input.email.toLowerCase();

  const user =
    await adminRepository.findUserForPasswordReset(normalizedEmail);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  await resetUserPassword(user.id, input.newPassword);

  if (input.revokeSessions) {
    await adminRepository.deleteUserSessions(user.id);
  }

  return {
    email: user.email,
    sessionsRevoked: input.revokeSessions,
  };
}

/* ----------------------------- Problem editor -------------------------- */

export async function getProblemForEditor(problemId: string) {
  const problem = await adminRepository.findProblemForEditor(problemId);

  if (!problem) {
    throw new NotFoundError("Problem not found");
  }

  const driverCode: Record<
    string,
    { header: string; template: string; footer: string }
  > = {};

  problem.driverCode.forEach((entry) => {
    driverCode[entry.language.toLowerCase()] = {
      header: entry.header || "",
      template: entry.template || "",
      footer: entry.footer || "",
    };
  });

  const publicTests = problem.runTestCase?.cases
    ? (problem.runTestCase.cases as unknown as {
        id?: string;
        input: string;
        output: string;
      }[])
    : [];
  const hiddenTests = problem.testCase?.cases
    ? (problem.testCase.cases as unknown as {
        id?: string;
        input: string;
        output: string;
      }[])
    : [];

  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    hidden: problem.hidden,
    tags: problem.tags.map((problemTag) => problemTag.tag.name),
    description: problem.description,
    testCases: {
      public: publicTests.map((testCase, index) => ({
        id: testCase.id || `pub-${index}`,
        input: testCase.input,
        output: testCase.output,
      })),
      hidden: hiddenTests.map((testCase, index) => ({
        id: testCase.id || `hid-${index}`,
        input: testCase.input,
        output: testCase.output,
      })),
    },
    driverCode,
    solutions: problem.referenceSolutions.map((solution) => ({
      id: solution.id,
      language: solution.language,
      code: solution.code,
    })),
    status: problem.isPublished ? "PUBLISHED" : "DRAFT",
  };
}

export async function saveProblem(
  adminId: string,
  problemId: string | undefined,
  input: ProblemEditorInput,
) {
  const isPublished = input.status === "PUBLISHED";

  if (
    isPublished &&
    !input.solutions.some((solution) => solution.code.trim().length > 0)
  ) {
    throw new ValidationError(
      "At least one reference solution is required to publish.",
    );
  }

  if (problemId) {
    const existing = await adminRepository.findProblemById(problemId);

    if (!existing) {
      throw new NotFoundError("Problem not found");
    }
  }

  await adminRepository.upsertTagNames(input.tags);
  const tagIds = (
    await adminRepository.findTagIdsByNames(input.tags)
  ).map((tag) => tag.id);

  const publicCases = input.testCases.public.map((testCase, index) => ({
    id: testCase.id || `pub-${index}`,
    input: testCase.input,
    output: testCase.output,
  }));
  const hiddenCases = input.testCases.hidden.map((testCase, index) => ({
    id: testCase.id || `hid-${index}`,
    input: testCase.input,
    output: testCase.output,
  }));

  const saved = await adminRepository.saveEditorProblem({
    problemId,
    fields: {
      title: input.title,
      description: input.description.trim(),
      difficulty: input.difficulty,
      isPublished,
      hidden: input.hidden,
      ownerType: "ADMIN",
      visibility: "PUBLIC",
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      approvedById: adminId,
    },
    tagIds,
    publicCases,
    hiddenCases,
    driverCode: Object.entries(input.driverCode).map(([language, code]) => ({
      language: language as ProgrammingLanguage,
      header: code.header,
      template: code.template,
      footer: code.footer,
    })),
    solutions: input.solutions.map((solution) => ({
      language: solution.language as ProgrammingLanguage,
      code: solution.code,
    })),
  });

  return { id: saved.id, message: "Problem saved successfully" };
}

export function runReferenceSolution(input: RunReferenceSolutionInput) {
  return runRawCodeService(input);
}

export async function listProblems(query: AdminProblemsQuery) {
  const problems = await adminRepository.findAdminProblems({
    searchValue: query.searchValue,
    take: query.take,
    skip: query.skip,
  });

  return { problems };
}

export async function setProblemHidden(problemId: string, hidden: boolean) {
  const existing = await adminRepository.findProblemById(problemId);

  if (!existing) {
    throw new NotFoundError("Problem not found");
  }

  await adminRepository.updateProblemHidden(problemId, hidden);

  return { message: "Updated successfully" };
}

export async function setProblemPublished(
  problemId: string,
  isPublished: boolean,
) {
  const existing = await adminRepository.findProblemById(problemId);

  if (!existing) {
    throw new NotFoundError("Problem not found");
  }

  await adminRepository.updateProblemPublished(problemId, isPublished);

  return { message: "Updated successfully" };
}

export function analyzeProblemRuntime(input: {
  headers: IncomingHttpHeaders;
  problemId: string;
  language: string;
  sourceCode: string;
}) {
  return analyzeRuntime(
    input.headers,
    input.problemId,
    input.language,
    input.sourceCode,
  );
}

/* ------------------------------- Colleges ------------------------------ */

export function listColleges() {
  return adminRepository.listColleges();
}

export async function addCollege(name: string) {
  const existing = await adminRepository.findCollegeByName(name);

  if (existing) {
    throw new ConflictError("College already exists");
  }

  return adminRepository.createCollege(name);
}

/* ---------------------------- Bulk signups ----------------------------- */

async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const hashedPassword = await hashPassword(newPassword);
  const credentialAccount =
    await adminRepository.findCredentialAccount(userId);

  if (credentialAccount) {
    await adminRepository.updateAccountPassword(
      credentialAccount.id,
      hashedPassword,
    );
    return;
  }

  await adminRepository.createCredentialAccount({ userId, hashedPassword });
}

async function handleGroupMembership(
  groupId: string,
  userId: string,
): Promise<void> {
  const group = await adminRepository.findGroupById(groupId);
  if (!group) return;

  const existingMember = await adminRepository.findGroupMember(groupId, userId);
  if (existingMember) return;

  await adminRepository.createGroupMember({
    groupId,
    userId,
    roleId: GROUP_ROLE_IDS.MEMBER,
  });
}

function readSpreadsheetRows(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
}

async function requireCollege(collegeId: string | undefined) {
  if (!collegeId) {
    throw new ValidationError("College selection is required");
  }

  const college = await adminRepository.findCollegeById(collegeId);

  if (!college) {
    throw new ValidationError("Selected college not found");
  }

  return college;
}

export interface BulkSignupOutcome {
  success: boolean;
  results: BulkSignupResultRow[];
  passwordsCsv: string;
}

export async function bulkStudentSignUp(input: {
  fileBuffer: Buffer;
  meta: BulkSignupMetaInput;
}): Promise<BulkSignupOutcome> {
  const college = await requireCollege(input.meta.collegeId);
  const groupId = input.meta.groupId;

  const rows = readSpreadsheetRows(input.fileBuffer);

  if (!rows.length) {
    throw new ValidationError("Excel file is empty");
  }

  const results: BulkSignupResultRow[] = [];

  for (const raw of rows) {
    const row = parseStudentSignupRow(raw);

    if (!row.name || !row.email || !row.rollNumber) {
      results.push({
        email: row.email || "unknown",
        name: row.name || "unknown",
        password: "",
        result: "error",
        message: "Missing required fields (Name, Email, Roll Number)",
      });
      continue;
    }

    const profile = {
      rollNumber: row.rollNumber,
      collegeId: college.id,
      branch: row.branch,
      semester: row.semester,
      batch: row.batch,
    };

    const existingUser = await adminRepository.findUserByEmail(row.email);

    if (existingUser) {
      const password = generateRandomPassword();
      await resetUserPassword(existingUser.id, password);

      await adminRepository.activateUserByEmail(
        row.email,
        GLOBAL_ROLE_IDS.ORG_STUDENT,
      );

      await adminRepository.upsertStudentProfile(existingUser.id, profile);

      if (groupId) {
        await handleGroupMembership(groupId, existingUser.id);
      }

      results.push({
        email: row.email,
        name: row.name,
        password,
        result: "created",
      });
      continue;
    }

    const password = generateRandomPassword();

    try {
      await auth.api.signUpEmail({
        body: { email: row.email, password, name: row.name },
        headers: new Headers(),
      });

      const user = await adminRepository.activateUserByEmail(
        row.email,
        GLOBAL_ROLE_IDS.ORG_STUDENT,
      );

      await adminRepository.createStudentProfile(user.id, profile);

      if (groupId) {
        await handleGroupMembership(groupId, user.id);
      }

      results.push({
        email: row.email,
        name: row.name,
        password,
        result: "created",
      });
    } catch (error) {
      results.push({
        email: row.email,
        name: row.name,
        password: "",
        result: "error",
        message: extractAuthErrorMessage(error, "Failed to create account"),
      });
    }
  }

  return {
    success: results.every((row) => row.result === "created"),
    results,
    passwordsCsv: buildPasswordsCsv(results),
  };
}

export async function bulkTeacherSignUp(input: {
  fileBuffer: Buffer;
  meta: BulkSignupMetaInput;
}): Promise<BulkSignupOutcome> {
  const college = await requireCollege(input.meta.collegeId);
  const groupId = input.meta.groupId;

  const rows = readSpreadsheetRows(input.fileBuffer);

  if (!rows.length) {
    throw new ValidationError("Excel file is empty");
  }

  const results: BulkSignupResultRow[] = [];

  for (const raw of rows) {
    const row = parseTeacherSignupRow(raw);

    if (!row.name || !row.email) {
      results.push({
        email: row.email || "unknown",
        name: row.name || "unknown",
        password: "",
        result: "error",
        message: "Missing required fields (Name, Email)",
      });
      continue;
    }

    const profile = {
      employeeId: row.employeeId,
      department: row.department,
      collegeId: college.id,
    };

    const existingUser = await adminRepository.findUserByEmail(row.email);

    if (existingUser) {
      const password = generateRandomPassword();
      await resetUserPassword(existingUser.id, password);

      await adminRepository.activateUserByEmail(
        row.email,
        GLOBAL_ROLE_IDS.ORG_TEACHER,
      );

      await adminRepository.upsertTeacherProfile(existingUser.id, profile);

      if (groupId) {
        await handleGroupMembership(groupId, existingUser.id);
      }

      results.push({
        email: row.email,
        name: row.name,
        password,
        result: "created",
      });
      continue;
    }

    const password = generateRandomPassword();

    try {
      await auth.api.signUpEmail({
        body: { email: row.email, password, name: row.name },
        headers: new Headers(),
      });

      const user = await adminRepository.activateUserByEmail(
        row.email,
        GLOBAL_ROLE_IDS.ORG_TEACHER,
      );

      await adminRepository.createTeacherProfile(user.id, profile);

      if (groupId) {
        await handleGroupMembership(groupId, user.id);
      }

      results.push({
        email: row.email,
        name: row.name,
        password,
        result: "created",
      });
    } catch (error) {
      results.push({
        email: row.email,
        name: row.name,
        password: "",
        result: "error",
        message: extractAuthErrorMessage(error, "Failed to create account"),
      });
    }
  }

  return {
    success: results.every((row) => row.result === "created"),
    results,
    passwordsCsv: buildPasswordsCsv(results),
  };
}

export async function uploadSignupCsv(
  input: BulkSignupCsvInput,
): Promise<{ key: string }> {
  const finalName = sanitizeCsvFilename(input.filename);
  const key = `bulk-signups/${finalName}`;

  await uploadToS3(key, input.csvContent, getBulkSignupBucket());

  return { key };
}

/* ------------------------ Credentials emails --------------------------- */

export interface CredentialsEmailOutcome {
  success: boolean;
  results: CredentialsEmailResultRow[];
  summary: { sent: number; failed: number; total: number };
}

export async function sendCredentialsEmail(
  fileBuffer: Buffer,
): Promise<CredentialsEmailOutcome> {
  const csvText = fileBuffer.toString("utf-8");
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    throw new ValidationError("CSV file is empty or missing data rows");
  }

  const rows = parseCredentialsCsv(csvText);
  const results: CredentialsEmailResultRow[] = [];

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  for (const row of rows) {
    if (!row.email || !row.password) {
      results.push({
        email: row.email || "unknown",
        name: "unknown",
        result: "error",
        message: `Row ${row.lineNumber}: missing Email or Password`,
      });
      continue;
    }

    try {
      const user = await adminRepository.findUserForCredentialsEmail(
        row.email,
      );

      if (!user) {
        results.push({
          email: row.email,
          name: "unknown",
          result: "error",
          message: "User not found",
        });
        continue;
      }

      const displayName = user.name || row.email.split("@")[0];
      const isTeacher = user.globalRoleId === GLOBAL_ROLE_IDS.ORG_TEACHER;

      const templateInput = {
        displayName,
        email: row.email,
        password: row.password,
        frontendUrl,
      };

      const emailHtml = isTeacher
        ? buildTeacherCredentialsEmail(templateInput)
        : buildStudentCredentialsEmail(templateInput);

      await transporter.sendMail({
        from: "ABHAY SHARMA",
        to: row.email,
        subject: "Welcome to CodeColiseum — Your Account Details",
        text: `Hi ${displayName},\n\nYour CodeColiseum account has been created. Here are your login credentials:\n\nEmail: ${row.email}\nPassword: ${row.password}\n\nLogin here: ${frontendUrl}/login\n\nFor security, please change your password after logging in.\n\nIf you didn't request this account, please ignore this email.\n\n— CodeColiseum Team`,
        html: emailHtml,
      });

      results.push({ email: row.email, name: displayName, result: "sent" });
    } catch (error) {
      results.push({
        email: row.email,
        name: "unknown",
        result: "error",
        message:
          error instanceof Error ? error.message : "Failed to send email",
      });
    }
  }

  const sent = results.filter((row) => row.result === "sent").length;
  const failed = results.filter((row) => row.result === "error").length;

  return {
    success: failed === 0,
    results,
    summary: { sent, failed, total: results.length },
  };
}
