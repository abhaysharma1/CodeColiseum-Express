import type { Request, Response } from "express";
import { asyncHandler } from "@/shared/http/async-handler";
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from "@/middleware/validation";
import { UnauthorizedError } from "@/shared/errors";
import { toSebRequestContext } from "@/utils/exam.utils";
import * as labService from "./lab.service";
import type {
  AddLabTeacherInput,
  AddModuleProblemsInput,
  AssignAssessmentInput,
  AssignLabInput,
  CreateAssessmentInput,
  CreateLabInput,
  CreateModuleInput,
  ListLabsQuery,
  ModuleAnalyticsQuery,
  StudentProgressQuery,
  TeacherSearchQuery,
  UpdateLabInput,
  UpdateModuleInput,
  UpdateModuleProblemAccessInput,
} from "./lab.schema";

function requireUserId(req: Request): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError("Unauthorized");
  }

  return userId;
}

// ── Teacher: labs ──

export const createLab = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const body = getValidatedBody<CreateLabInput>(req);

  const lab = await labService.createLabForTeacher(userId, body);
  return res.status(201).json(lab);
});

export const getLabs = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const query = getValidatedQuery<ListLabsQuery>(req);

  const result = await labService.listLabsForTeacher(userId, query);
  return res.status(200).json(result);
});

export const getLab = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { labId } = getValidatedParams<{ labId: string }>(req);

  const lab = await labService.getLabForTeacher(userId, labId);
  return res.status(200).json(lab);
});

export const updateLab = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { labId } = getValidatedParams<{ labId: string }>(req);
  const body = getValidatedBody<UpdateLabInput>(req);

  const lab = await labService.updateLabForTeacher(userId, labId, body);
  return res.status(200).json(lab);
});

export const deleteLab = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { labId } = getValidatedParams<{ labId: string }>(req);

  const result = await labService.deleteLabForTeacher(userId, labId);
  return res.status(200).json(result);
});

// ── Teacher: assignments ──

export const getLabAssignments = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const assignments = await labService.getLabAssignmentsForTeacher(
      userId,
      labId,
    );
    return res.status(200).json(assignments);
  },
);

export const assignLab = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { labId } = getValidatedParams<{ labId: string }>(req);
  const body = getValidatedBody<AssignLabInput>(req);

  const result = await labService.assignLabToGroup(
    userId,
    labId,
    body.groupId,
  );
  return res.status(200).json(result);
});

export const unassignLab = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const result = await labService.unassignLabFromGroup(userId, labId);
    return res.status(200).json(result);
  },
);

// ── Teacher: modules ──

export const createModule = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);
    const body = getValidatedBody<CreateModuleInput>(req);

    const module = await labService.createModuleForTeacher(
      userId,
      labId,
      body,
    );
    return res.status(201).json(module);
  },
);

export const getLabModules = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const modules = await labService.listModulesForTeacher(userId, labId);
    return res.status(200).json(modules);
  },
);

export const getModule = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { moduleId } = getValidatedParams<{ moduleId: string }>(req);

  const module = await labService.getModuleForTeacher(userId, moduleId);
  return res.status(200).json(module);
});

export const updateModule = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const body = getValidatedBody<UpdateModuleInput>(req);

    const module = await labService.updateModuleForTeacher(
      userId,
      moduleId,
      body,
    );
    return res.status(200).json(module);
  },
);

export const deleteModule = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);

    const result = await labService.deleteModuleForTeacher(userId, moduleId);
    return res.status(200).json(result);
  },
);

// ── Teacher: module problems ──

export const addModuleProblems = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const body = getValidatedBody<AddModuleProblemsInput>(req);

    const result = await labService.addProblemsToModule(
      userId,
      moduleId,
      body,
    );
    return res.status(200).json(result);
  },
);

export const getModuleProblems = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);

    const problems = await labService.listModuleProblemsForTeacher(
      userId,
      moduleId,
    );
    return res.status(200).json(problems);
  },
);

export const updateModuleProblemAccess = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleProblemId } = getValidatedParams<{
      moduleProblemId: string;
    }>(req);
    const body = getValidatedBody<UpdateModuleProblemAccessInput>(req);

    const result = await labService.updateModuleProblemAccessForTeacher(
      userId,
      moduleProblemId,
      body,
    );
    return res.status(200).json(result);
  },
);

export const getModuleProblemAccess = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleProblemId } = getValidatedParams<{
      moduleProblemId: string;
    }>(req);

    const result = await labService.getModuleProblemAccessForTeacher(
      userId,
      moduleProblemId,
    );
    return res.status(200).json(result);
  },
);

export const removeModuleProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleProblemId } = getValidatedParams<{
      moduleProblemId: string;
    }>(req);

    const result = await labService.removeModuleProblemForTeacher(
      userId,
      moduleProblemId,
    );
    return res.status(200).json(result);
  },
);

// ── Teacher: assessments ──

export const assignAssessment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const body = getValidatedBody<AssignAssessmentInput>(req);

    const result = await labService.assignModuleAssessment(
      userId,
      moduleId,
      body,
    );
    return res.status(200).json(result);
  },
);

export const updateAssessment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const body = getValidatedBody<AssignAssessmentInput>(req);

    const result = await labService.updateModuleAssessment(
      userId,
      moduleId,
      body,
    );
    return res.status(200).json(result);
  },
);

export const removeAssessment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);

    const result = await labService.removeModuleAssessment(userId, moduleId);
    return res.status(200).json(result);
  },
);

export const createAssessment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const body = getValidatedBody<CreateAssessmentInput>(req);

    const result = await labService.createModuleAssessment(
      userId,
      moduleId,
      body,
    );
    return res.status(201).json(result);
  },
);

export const getAssessment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);

    const result = await labService.getModuleAssessmentForTeacher(
      userId,
      moduleId,
    );
    return res.status(200).json(result);
  },
);

// ── Teacher: analytics ──

export const getAssessmentResults = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const query = getValidatedQuery<ModuleAnalyticsQuery>(req);

    const result = await labService.getAssessmentResultsForTeacher(
      userId,
      moduleId,
      query.groupId,
    );
    return res.status(200).json(result);
  },
);

export const getModuleStudentProgress = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const query = getValidatedQuery<StudentProgressQuery>(req);

    const result = await labService.getModuleStudentProgressForTeacher(
      userId,
      moduleId,
      query,
    );
    return res.status(200).json(result);
  },
);

export const getModuleStudentAttempts = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId, studentId } = getValidatedParams<{
      moduleId: string;
      studentId: string;
    }>(req);

    const result = await labService.getModuleStudentAttemptsForTeacher(
      userId,
      moduleId,
      studentId,
    );
    return res.status(200).json(result);
  },
);

export const getModuleStudentProblemSubmissions = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId, studentId, moduleProblemId } = getValidatedParams<{
      moduleId: string;
      studentId: string;
      moduleProblemId: string;
    }>(req);

    const result =
      await labService.getModuleStudentProblemSubmissionsForTeacher(
        userId,
        moduleId,
        studentId,
        moduleProblemId,
      );
    return res.status(200).json(result);
  },
);

export const getModuleProblemAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);
    const query = getValidatedQuery<ModuleAnalyticsQuery>(req);

    const result = await labService.getModuleProblemAnalyticsForTeacher(
      userId,
      moduleId,
      query.groupId,
    );
    return res.status(200).json(result);
  },
);

export const getLabsStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    const result = await labService.getLabsStats(userId);
    return res.status(200).json(result);
  },
);

// ── Teacher: teacher management ──

export const searchTeachers = asyncHandler(
  async (req: Request, res: Response) => {
    requireUserId(req);
    const query = getValidatedQuery<TeacherSearchQuery>(req);

    const teachers = await labService.searchTeachers(query.q);
    return res.status(200).json(teachers);
  },
);

export const addLabTeacher = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);
    const body = getValidatedBody<AddLabTeacherInput>(req);

    const result = await labService.addTeacherToLab(userId, labId, body);
    return res.status(201).json(result);
  },
);

export const removeLabTeacher = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId, teacherUserId } = getValidatedParams<{
      labId: string;
      teacherUserId: string;
    }>(req);

    const result = await labService.removeTeacherFromLab(
      userId,
      labId,
      teacherUserId,
    );
    return res.status(200).json(result);
  },
);

export const getLabTeachers = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const teachers = await labService.listLabTeachersForTeacher(userId, labId);
    return res.status(200).json(teachers);
  },
);

// ── Teacher: publish / marketplace analytics ──

export const publishLab = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { labId } = getValidatedParams<{ labId: string }>(req);

  const lab = await labService.publishLabForTeacher(userId, labId);
  return res.status(200).json(lab);
});

export const unpublishLab = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const lab = await labService.unpublishLabForTeacher(userId, labId);
    return res.status(200).json(lab);
  },
);

export const getLabAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { labId } = getValidatedParams<{ labId: string }>(req);

    const analytics = await labService.getLabAnalyticsForTeacher(userId, labId);
    return res.status(200).json(analytics);
  },
);

// ── Student ──

export const getMyLabs = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  const labs = await labService.getStudentMyLabs(userId);
  return res.status(200).json(labs);
});

export const getMyLab = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { labId } = getValidatedParams<{ labId: string }>(req);

  const lab = await labService.getStudentMyLab(userId, labId);
  return res.status(200).json(lab);
});

export const getStudentModuleProblems = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);

    const result = await labService.getStudentModuleProblems(
      userId,
      moduleId,
      toSebRequestContext(req),
    );
    return res.status(200).json(result);
  },
);

export const getStudentModuleProgress = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);

    const result = await labService.getStudentModuleProgress(userId, moduleId);
    return res.status(200).json(result);
  },
);

export const getStudentModuleAssessment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleId } = getValidatedParams<{ moduleId: string }>(req);

    const result = await labService.getStudentModuleAssessment(
      userId,
      moduleId,
    );
    return res.status(200).json(result);
  },
);

export const getStudentModuleProblem = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { moduleProblemId } = getValidatedParams<{
      moduleProblemId: string;
    }>(req);

    const result = await labService.getStudentModuleProblem(
      userId,
      moduleProblemId,
    );
    return res.status(200).json(result);
  },
);
