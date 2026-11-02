import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedBody,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import * as examTeacherService from "./exam-teacher.service";
import type {
  BulkExamActionBody,
  FetchAllExamsQuery,
  SaveExamBody,
  UpdateExamSettingsBody,
} from "./teacher.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

export const fetchAllExams = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const query = getValidatedQuery<FetchAllExamsQuery>(req);

    const result = await examTeacherService.fetchAllExams(userId, query);
    return res.status(200).json(result);
  },
);

export const getExamDashboardStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    const stats = await examTeacherService.getExamDashboardStats(userId);
    return res.status(200).json(stats);
  },
);

export const draftExam = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    const exam = await examTeacherService.draftExam(userId);
    return res.status(201).json(exam);
  },
);

export const duplicateExam = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);

    const exam = await examTeacherService.duplicateExam(userId, examId);
    return res.status(201).json(exam);
  },
);

export const getExam = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { examId } = getValidatedQuery<{ examId: string }>(req);

  const exam = await examTeacherService.getExam(userId, examId);
  return res.status(200).json(exam);
});

export const getAllGroupExams = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);

    const groups = await examTeacherService.getAllGroupExams(userId, examId);
    return res.status(200).json(groups);
  },
);

export const getAllExamProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);

    const problems = await examTeacherService.getAllExamProblem(userId, examId);
    return res.status(200).json(problems);
  },
);

export const saveDraft = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const body = getValidatedBody<SaveExamBody>(req);

  const result = await examTeacherService.saveDraft(userId, body);
  return res.status(200).json(result);
});

export const publishExam = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<SaveExamBody>(req);

    const result = await examTeacherService.publishExam(userId, body);
    return res.status(200).json(result);
  },
);

export const updateExamSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const body = getValidatedBody<UpdateExamSettingsBody>(req);

    const result = await examTeacherService.updateExamSettings(userId, body);
    return res.status(200).json(result);
  },
);

export const getExamResults = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);

    const result = await examTeacherService.getExamResults(userId, examId);
    return res.status(200).json(result);
  },
);

export const getExamAIResults = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);

    const result = await examTeacherService.getExamAIResults(userId, examId);
    return res.status(200).json(result);
  },
);

export const startAiEvaluation = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedBody<{ examId: string }>(req);

    const result = await examTeacherService.startAiEvaluation(userId, examId);

    if (result.kind === "no-submissions") {
      // Legacy response shape: a bare message (no error envelope).
      return res.status(404).json({ message: "No submissions to evaluate" });
    }

    return res.status(201).json({
      message: "AI evaluation started",
      total: result.total,
    });
  },
);

export const getAiEvaluationStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { examId } = getValidatedQuery<{ examId: string }>(req);

    const status = await examTeacherService.getAiEvaluationStatus(
      userId,
      examId,
    );
    return res.status(200).json(status);
  },
);

export const publishBulkExams = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { testIds } = getValidatedBody<BulkExamActionBody>(req);

    const result = await examTeacherService.publishBulkExams(userId, testIds);
    return res.status(200).json(result);
  },
);

export const deleteBulkExams = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { testIds } = getValidatedBody<BulkExamActionBody>(req);

    const result = await examTeacherService.deleteBulkExams(userId, testIds);
    return res.status(200).json(result);
  },
);

export const archiveBulkExams = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { testIds } = getValidatedBody<BulkExamActionBody>(req);

    const result = await examTeacherService.archiveBulkExams(userId, testIds);
    return res.status(200).json(result);
  },
);

export const exportExamsCSV = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { testIds } = getValidatedBody<BulkExamActionBody>(req);

    const { csvContent } = await examTeacherService.exportExamsCSV(
      userId,
      testIds,
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="exams_${Date.now()}.csv"`,
    );

    return res.status(200).send(csvContent);
  },
);
