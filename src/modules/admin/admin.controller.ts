import type { Request, Response } from "express";
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError, ValidationError } from "@/shared/errors";
import { asyncHandler } from "@/shared/http/async-handler";
import * as adminService from "./admin.service";
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
  RuntimeAnalyzerInput,
  ToggleHiddenInput,
  TogglePublishInput,
  ValidateComplexityInput,
} from "./admin.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

function getSingleFile(
  req: Request,
  requiredMessage: string,
): Express.Multer.File {
  const file = req.file;

  if (!file) {
    throw new ValidationError(requiredMessage);
  }

  return file;
}

function getFieldFiles(
  req: Request,
): Record<string, Express.Multer.File[]> | undefined {
  return req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;
}

function bulkStatus(failed: number, total: number, successStatus: number) {
  if (failed === 0) return successStatus;
  return failed === total ? 400 : 207;
}

/* ----------------------------- Driver code ----------------------------- */

export const uploadDriverCode = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<DriverCodeInput>(req);
    const data = await adminService.saveDriverCode(body);

    return res.status(201).json({ success: true, data });
  },
);

/* ------------------------- Performance limits ------------------------- */

export const getPerformanceConstraints = asyncHandler(
  async (req: Request, res: Response) => {
    const { problemId } = getValidatedQuery<{ problemId: string }>(req);
    const constraints = await adminService.getPerformanceConstraints(problemId);

    return res.status(200).json({ constraints: constraints || null });
  },
);

export const createUpdatePerformanceConstraints = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<PerformanceConstraintsInput>(req);
    const constraints = await adminService.savePerformanceConstraints(body);

    return res.status(200).json({ constraints });
  },
);

export const deletePerformanceConstraints = asyncHandler(
  async (req: Request, res: Response) => {
    const { problemId } = getValidatedQuery<{ problemId: string }>(req);
    await adminService.removePerformanceConstraints(problemId);

    return res.status(200).json({
      success: true,
      message: "Constraints deleted successfully",
    });
  },
);

/* ------------------------ Performance test cases ----------------------- */

export const getPerformanceTestCases = asyncHandler(
  async (req: Request, res: Response) => {
    const { problemId } = getValidatedQuery<{ problemId: string }>(req);
    const testCases = await adminService.listPerformanceTestCases(problemId);

    return res.status(200).json({ testCases });
  },
);

export const createPerformanceTestCase = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<CreatePerformanceTestCaseInput>(req);
    const files = getFieldFiles(req);
    const inputFile = files?.input?.[0];
    const outputFile = files?.output?.[0];

    if (!inputFile || !outputFile) {
      throw new ValidationError("Both input and output files are required");
    }

    const testCase = await adminService.addPerformanceTestCase({
      ...body,
      inputBuffer: inputFile.buffer,
      outputBuffer: outputFile.buffer,
    });

    return res.status(201).json({ testCase });
  },
);

export const deletePerformanceTestCase = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = getValidatedParams<{ id: string }>(req);
    await adminService.removePerformanceTestCase(id);

    return res.status(200).json({
      success: true,
      message: "Performance test case deleted",
    });
  },
);

/* --------------------------- Problem import ---------------------------- */

export const uploadProblems = asyncHandler(
  async (req: Request, res: Response) => {
    const problems = getValidatedBody<BulkProblemInput[]>(req);
    const results = await adminService.importProblems(problems);

    return res.status(201).json({ success: true, results });
  },
);

export const validateComplexityCases = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<ValidateComplexityInput>(req);
    const outcome = await adminService.validateComplexity(body);

    return res.status(outcome.passed ? 200 : 422).json({
      validation: outcome.passed ? "Successful" : "Failed",
      expectedComplexity: outcome.expectedComplexity,
      yourComplexity: outcome.yourComplexity,
      ratio: outcome.ratio,
    });
  },
);

export const validateProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const problems = getValidatedBody<BulkProblemInput[]>(req);
    const result = await adminService.validateProblem(problems);

    return res.status(200).json(result);
  },
);

/* ------------------------------- Accounts ------------------------------ */

export const bulkSignUp = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<BulkSignUpInput>(req);
    const result = await adminService.bulkSignUp(body);
    const failed = result.results.filter((row) => row.result === "error");

    return res
      .status(bulkStatus(failed.length, result.results.length, 201))
      .json({ success: result.success, results: result.results });
  },
);

export const adminSingleSignUp = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<AdminSingleSignUpInput>(req);
    const user = await adminService.singleSignUp(body);

    return res.status(201).json({ success: true, user });
  },
);

export const assignUserRoleByEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<AdminAssignRoleInput>(req);
    const user = await adminService.assignUserRole(body);

    return res.status(200).json({ success: true, user });
  },
);

export const resetUserPasswordByEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<AdminResetPasswordInput>(req);
    const result = await adminService.resetUserPasswordByEmail(body);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      email: result.email,
      sessionsRevoked: result.sessionsRevoked,
    });
  },
);

/* ------------------------------- Colleges ------------------------------ */

export const getColleges = asyncHandler(
  async (_req: Request, res: Response) => {
    const colleges = await adminService.listColleges();
    return res.status(200).json(colleges);
  },
);

export const createCollege = asyncHandler(
  async (req: Request, res: Response) => {
    const { name } = getValidatedBody<{ name: string }>(req);
    const college = await adminService.addCollege(name);

    return res.status(201).json(college);
  },
);

/* ---------------------------- Bulk signups ----------------------------- */

export const bulkStudentSignUp = asyncHandler(
  async (req: Request, res: Response) => {
    const file = getSingleFile(req, "Excel file is required");
    const meta = getValidatedBody<BulkSignupMetaInput>(req);

    const result = await adminService.bulkStudentSignUp({
      fileBuffer: file.buffer,
      meta,
    });

    const failed = result.results.filter((row) => row.result === "error");

    return res
      .status(bulkStatus(failed.length, result.results.length, 201))
      .json({
        success: result.success,
        results: result.results,
        passwordsCsv: result.passwordsCsv,
      });
  },
);

export const bulkTeacherSignUp = asyncHandler(
  async (req: Request, res: Response) => {
    const file = getSingleFile(req, "Excel file is required");
    const meta = getValidatedBody<BulkSignupMetaInput>(req);

    const result = await adminService.bulkTeacherSignUp({
      fileBuffer: file.buffer,
      meta,
    });

    const failed = result.results.filter((row) => row.result === "error");

    return res
      .status(bulkStatus(failed.length, result.results.length, 201))
      .json({
        success: result.success,
        results: result.results,
        passwordsCsv: result.passwordsCsv,
      });
  },
);

export const bulkSignupUploadCsv = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<BulkSignupCsvInput>(req);
    const { key } = await adminService.uploadSignupCsv(body);

    return res.status(200).json({ success: true, key });
  },
);

export const sendCredentialsEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const file = getSingleFile(req, "CSV file is required");
    const outcome = await adminService.sendCredentialsEmail(file.buffer);
    const { sent, failed, total } = outcome.summary;

    return res
      .status(bulkStatus(failed, total, 200))
      .json({
        success: outcome.success,
        results: outcome.results,
        summary: { sent, failed, total },
      });
  },
);

/* ----------------------------- Problem editor -------------------------- */

export const getProblemForEditor = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = getValidatedParams<{ id: string }>(req);
    const problem = await adminService.getProblemForEditor(id);

    return res.status(200).json(problem);
  },
);

export const upsertProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const adminId = requireUserId(req);
    const { id: problemId } = getValidatedParams<{ id?: string }>(req);
    const body = getValidatedBody<ProblemEditorInput>(req);

    const result = await adminService.saveProblem(adminId, problemId, body);

    return res.status(200).json(result);
  },
);

export const runReferenceSolution = asyncHandler(
  async (req: Request, res: Response) => {
    const body = getValidatedBody<RunReferenceSolutionInput>(req);
    const result = await adminService.runReferenceSolution(body);

    return res.status(200).json(result);
  },
);

export const getProblemsForAdmin = asyncHandler(
  async (req: Request, res: Response) => {
    const query = getValidatedQuery<AdminProblemsQuery>(req);
    const result = await adminService.listProblems(query);

    return res.status(200).json(result);
  },
);

export const toggleProblemHidden = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = getValidatedParams<{ id: string }>(req);
    const body = getValidatedBody<ToggleHiddenInput>(req);
    const result = await adminService.setProblemHidden(id, body.hidden);

    return res.status(200).json(result);
  },
);

export const toggleProblemPublish = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = getValidatedParams<{ id: string }>(req);
    const body = getValidatedBody<TogglePublishInput>(req);
    const result = await adminService.setProblemPublished(
      id,
      body.isPublished,
    );

    return res.status(200).json(result);
  },
);

export const runtimeAnalyzer = asyncHandler(
  async (req: Request, res: Response) => {
    const { problemId } = getValidatedParams<{ problemId: string }>(req);
    const body = getValidatedBody<RuntimeAnalyzerInput>(req);

    const result = await adminService.analyzeProblemRuntime({
      headers: req.headers,
      problemId,
      language: body.language,
      sourceCode: body.sourceCode,
    });

    return res.status(200).json(result);
  },
);
