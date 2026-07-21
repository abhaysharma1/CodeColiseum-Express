import { NextFunction, Request, Response } from "express";
import prisma from "@/utils/prisma";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import {
  createLabSchema,
  updateLabSchema,
  assignLabSchema,
  createModuleSchema,
  updateModuleSchema,
  addModuleProblemsSchema,
  updateModuleProblemAccessSchema,
  assignAssessmentSchema,
  createAssessmentSchema,
} from "@/validations/lab.schema";
import {
  getTeacherLabOrThrow,
  getTeacherLabForWrite,
  getTeacherModuleOrThrow,
  getTeacherModuleForWrite,
  getTeacherModuleProblemOrThrow,
  getTeacherModuleProblemForWrite,
  getAssessmentOrThrow,
  toAssessmentDTO,
  getLabAssignments as getLabAssignmentsService,
  getModuleProblemAnalytics as getModuleProblemAnalyticsService,
  getModuleStudentProgress as getModuleStudentProgressService,
  getAssessmentResults as getAssessmentResultsService,
  addLabTeacher as addLabTeacherService,
  removeLabTeacher as removeLabTeacherService,
  getLabTeachers as getLabTeachersService,
} from "@/services/lab.service";
import * as marketplaceService from "@/services/marketplace.service";
import { publishLabSchema } from "@/validations/marketplace.schema";
import { exportModuleAnalytics as exportModuleAnalyticsFn } from "@/controllers/module-export.controller";

export const createLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const parsed = createLabSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
    }

    const lab = await prisma.lab.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        creatorId: req.user!.id,
        aiEnabled: parsed.data.aiEnabled,
        aiMaxMessages: parsed.data.aiMaxMessages ?? null,
        aiMaxTokens: parsed.data.aiMaxTokens ?? null,
      },
    });

    res.status(201).json(lab);
  } catch (error) {
    next(error);
  }
};

export const getLabs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const take = Number(req.query.take) || 10;
    const skip = Number(req.query.skip) || 0;
    const scope = req.query.scope as string | undefined;
    const searchValue = req.query.searchvalue as string | undefined;

    const where: any = scope === "owned"
      ? { creatorId: user.id }
      : {
          OR: [
            { creatorId: user.id },
            { teachers: { some: { userId: user.id } } },
          ],
        };

    if (searchValue) {
      where.title = { contains: searchValue, mode: "insensitive" };
    }

    const [labs, total] = await Promise.all([
      prisma.lab.findMany({
        where,
        include: {
          _count: { select: { modules: true, assignments: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.lab.count({ where }),
    ]);

    res.status(200).json({
      data: labs.map((lab: any) => ({
        id: lab.id,
        title: lab.title,
        description: lab.description,
        creatorId: lab.creatorId,
        createdAt: lab.createdAt,
        updatedAt: lab.updatedAt,
        aiEnabled: lab.aiEnabled,
        aiMaxMessages: lab.aiMaxMessages,
        aiMaxTokens: lab.aiMaxTokens,
        modulesCount: lab._count.modules,
        assignedGroupsCount: lab._count.assignments,
        visibility: lab.visibility,
        duplicateCount: lab.duplicateCount,
        originalLabId: lab.originalLabId,
        isArchived: lab.isArchived,
        publishedAt: lab.publishedAt,
      })),
      pagination: {
        take,
        skip,
        total,
        pages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    const lab = await getTeacherLabOrThrow(user.id, labId);

    const modulesCount = await prisma.labModule.count({
      where: { labId: lab.id },
    });

    res.status(200).json({
      ...lab,
      modulesCount,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabForWrite(user.id, labId);

    const parsed = updateLabSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed" });
    }

    const data: any = { ...parsed.data };

    // If aiEnabled is explicitly false, clear quota fields
    if (parsed.data.aiEnabled === false) {
      data.aiMaxMessages = null;
      data.aiMaxTokens = null;
    }

    const lab = await prisma.lab.update({
      where: { id: labId },
      data,
    });

    res.status(200).json(lab);
  } catch (error) {
    next(error);
  }
};

export const deleteLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabForWrite(user.id, labId);

    await prisma.lab.delete({ where: { id: labId } });

    res.status(200).json({ success: true, message: "Lab deleted" });
  } catch (error) {
    next(error);
  }
};

export const getLabAssignments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabOrThrow(user.id, labId);
    const assignedGroups = await getLabAssignmentsService(labId);
    res.status(200).json(assignedGroups);
  } catch (error) {
    next(error);
  }
};

export const assignLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabForWrite(user.id, labId);

    const parsed = assignLabSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed" });
    }

    const group = await prisma.group.findUnique({
      where: { id: parsed.data.groupId },
      select: { id: true, name: true },
    });

    if (!group) {
      return res.status(400).json({ success: false, message: "Group not found" });
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.labAssignment.deleteMany({ where: { labId } });
      await tx.labAssignment.create({
        data: { labId, groupId: group.id },
      });
    });

    res.status(200).json({
      labId,
      assignedGroup: { groupId: group.id, groupName: group.name },
    });
  } catch (error) {
    next(error);
  }
};

export const unassignLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabForWrite(user.id, labId);

    await prisma.labAssignment.deleteMany({ where: { labId } });

    res.status(200).json({ success: true, message: "Lab unassigned" });
  } catch (error) {
    next(error);
  }
};

export const createModule = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabForWrite(user.id, labId);

    const parsed = createModuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
    }

    const existing = await prisma.labModule.findUnique({
      where: { labId_weekNumber: { labId, weekNumber: parsed.data.weekNumber } },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: "Week number already exists for this lab" });
    }

    const module = await prisma.labModule.create({
      data: {
        labId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        weekNumber: parsed.data.weekNumber,
        orderIndex: parsed.data.orderIndex ?? null,
        unlockAt: parsed.data.unlockAt ? new Date(parsed.data.unlockAt) : null,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        assessmentExamId: parsed.data.assessmentExamId ?? null,
      },
    });

    res.status(201).json(module);
  } catch (error) {
    next(error);
  }
};

export const getLabModules = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabOrThrow(user.id, labId);

    const modules = await prisma.labModule.findMany({
      where: { labId },
      include: { _count: { select: { problems: true } } },
      orderBy: [{ orderIndex: "asc" }, { weekNumber: "asc" }],
    });

    res.status(200).json(
      modules.map((m: any) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        labId: m.labId,
        weekNumber: m.weekNumber,
        orderIndex: m.orderIndex,
        unlockAt: m.unlockAt,
        dueAt: m.dueAt,
        assessmentExamId: m.assessmentExamId,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        problemsCount: m._count.problems,
      })),
    );
  } catch (error) {
    next(error);
  }
};

export const getModule = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const module = await getTeacherModuleOrThrow(user.id, moduleId);

    const problemsCount = await prisma.moduleProblem.count({
      where: { moduleId: module.id },
    });

    res.status(200).json({
      id: module.id,
      title: module.title,
      description: module.description,
      labId: module.labId,
      labCreatorId: (module as any).lab.creatorId,
      weekNumber: module.weekNumber,
      orderIndex: module.orderIndex,
      unlockAt: module.unlockAt,
      dueAt: module.dueAt,
      assessmentExamId: module.assessmentExamId,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
      problemsCount,
    });
  } catch (error) {
    next(error);
  }
};

export const updateModule = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const module = await getTeacherModuleForWrite(user.id, moduleId);

    const parsed = updateModuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
    }

    if (parsed.data.weekNumber !== undefined && parsed.data.weekNumber !== module.weekNumber) {
      const existing = await prisma.labModule.findUnique({
        where: { labId_weekNumber: { labId: module.labId, weekNumber: parsed.data.weekNumber } },
      });
      if (existing) {
        return res.status(409).json({ success: false, message: "Week number already exists for this lab" });
      }
    }

    const updated = await prisma.labModule.update({
      where: { id: moduleId },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.weekNumber !== undefined && { weekNumber: parsed.data.weekNumber }),
        ...(parsed.data.orderIndex !== undefined && { orderIndex: parsed.data.orderIndex }),
        ...(parsed.data.unlockAt !== undefined && { unlockAt: parsed.data.unlockAt ? new Date(parsed.data.unlockAt) : null }),
        ...(parsed.data.dueAt !== undefined && { dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null }),
        ...(parsed.data.assessmentExamId !== undefined && { assessmentExamId: parsed.data.assessmentExamId }),
      },
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteModule = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    await getTeacherModuleForWrite(user.id, moduleId);

    await prisma.labModule.delete({ where: { id: moduleId } });

    res.status(200).json({ success: true, message: "Module deleted" });
  } catch (error) {
    next(error);
  }
};

export const addModuleProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    await getTeacherModuleForWrite(user.id, moduleId);

    const parsed = addModuleProblemsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed" });
    }

    const existingProblems = await prisma.problem.findMany({
      where: { id: { in: parsed.data.problemIds } },
      select: { id: true, ownerId: true, visibility: true, approvalStatus: true },
    });

    if (existingProblems.length !== parsed.data.problemIds.length) {
      return res.status(400).json({ success: false, message: "One or more problems not found" });
    }

    const invalidIds = parsed.data.problemIds.filter((pid: string) => {
      const p = existingProblems.find((e: any) => e.id === pid);
      if (!p) return true;
      return !(
        (p.visibility === "PUBLIC" && p.approvalStatus === "APPROVED") ||
        p.ownerId === user.id
      );
    });

    if (invalidIds.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Access denied to problems: ${invalidIds.join(", ")}`,
      });
    }

    const result = await prisma.moduleProblem.createMany({
      data: parsed.data.problemIds.map((problemId: string, index: number) => ({
        moduleId,
        problemId,
        orderIndex: index,
      })),
      skipDuplicates: true,
    });

    res.status(200).json({
      moduleId,
      addedCount: result.count,
    });
  } catch (error) {
    next(error);
  }
};

export const getModuleProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    await getTeacherModuleOrThrow(user.id, moduleId);

    const problems = await prisma.moduleProblem.findMany({
      where: { moduleId },
      include: {
        problem: {
          select: { id: true, number: true, title: true, difficulty: true },
        },
      },
      orderBy: { orderIndex: "asc" },
    });

    res.status(200).json(
      problems.map((p: any) => ({
        id: p.id,
        moduleId: p.moduleId,
        problemId: p.problemId,
        orderIndex: p.orderIndex,
        problem: p.problem,
        isUnlocked: p.isUnlocked,
        availableFrom: p.availableFrom,
        availableUntil: p.availableUntil,
      })),
    );
  } catch (error) {
    next(error);
  }
};

export const updateModuleProblemAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleProblemId = req.params.moduleProblemId as string;
    await getTeacherModuleProblemForWrite(user.id, moduleProblemId);

    const parsed = updateModuleProblemAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
    }

    const data: any = {};
    if (parsed.data.isUnlocked !== undefined) {
      data.isUnlocked = parsed.data.isUnlocked;
    }
    if (parsed.data.availableFrom !== undefined) {
      data.availableFrom = parsed.data.availableFrom ? new Date(parsed.data.availableFrom) : null;
    }
    if (parsed.data.availableUntil !== undefined) {
      data.availableUntil = parsed.data.availableUntil ? new Date(parsed.data.availableUntil) : null;
    }

    await prisma.moduleProblem.update({
      where: { id: moduleProblemId },
      data,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const getModuleProblemAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleProblemId = req.params.moduleProblemId as string;
    const mp = await getTeacherModuleProblemOrThrow(user.id, moduleProblemId);
    const mpAny = mp as any;

    res.status(200).json({
      isUnlocked: mpAny.isUnlocked ?? false,
      availableFrom: mpAny.availableFrom ?? null,
      availableUntil: mpAny.availableUntil ?? null,
    });
  } catch (error) {
    next(error);
  }
};

export const removeModuleProblem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleProblemId = req.params.moduleProblemId as string;
    await getTeacherModuleProblemForWrite(user.id, moduleProblemId);

    await prisma.moduleProblem.delete({
      where: { id: moduleProblemId },
    });

    res.status(200).json({ success: true, message: "Problem removed from module" });
  } catch (error) {
    next(error);
  }
};

export const assignAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    await getTeacherModuleForWrite(user.id, moduleId);

    const parsed = assignAssessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed" });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: parsed.data.examId },
      select: { id: true, creatorId: true },
    });
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }
    if (exam.creatorId !== user.id) {
      return res.status(403).json({ success: false, message: "You don't own this exam" });
    }

    await prisma.labModule.update({
      where: { id: moduleId },
      data: { assessmentExamId: exam.id },
    });

    res.status(200).json({
      moduleId,
      assessmentExamId: exam.id,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const module = await getTeacherModuleForWrite(user.id, moduleId);
    if (!module.assessmentExamId) {
      return res.status(400).json({ success: false, message: "No assessment to update. Use assign first." });
    }

    const parsed = assignAssessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed" });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: parsed.data.examId },
      select: { id: true, creatorId: true },
    });
    if (!exam) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }
    if (exam.creatorId !== user.id) {
      return res.status(403).json({ success: false, message: "You don't own this exam" });
    }

    await prisma.labModule.update({
      where: { id: moduleId },
      data: { assessmentExamId: exam.id },
    });

    res.status(200).json({
      moduleId,
      assessmentExamId: exam.id,
    });
  } catch (error) {
    next(error);
  }
};

export const removeAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    await getTeacherModuleForWrite(user.id, moduleId);

    await prisma.labModule.update({
      where: { id: moduleId },
      data: { assessmentExamId: null },
    });

    res.status(200).json({ success: true, message: "Assessment removed from module" });
  } catch (error) {
    next(error);
  }
};

export const createAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const module = await getTeacherModuleForWrite(user.id, moduleId);

    const parsed = createAssessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed" });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx: any) => {
      const exam = await tx.exam.create({
        data: {
          title: parsed.data.title || `${module.title} - Assessment`,
          description: `Assessment for ${module.title}`,
          isPublished: false,
          creatorId: user.id,
          startDate: module.unlockAt || now,
          endDate: module.dueAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          durationMin: parsed.data.durationMin || 60,
          sebEnabled: false,
          status: "scheduled",
        },
      });

      const assignments = await tx.labAssignment.findMany({
        where: { labId: module.labId },
        select: { groupId: true },
      });

      if (assignments.length > 0) {
        await tx.examGroup.createMany({
          data: assignments.map((a: any) => ({
            examId: exam.id,
            groupId: a.groupId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.labModule.update({
        where: { id: moduleId },
        data: { assessmentExamId: exam.id },
      });

      return exam;
    });

    res.status(201).json({
      moduleId,
      assessmentExamId: result.id,
      exam: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    await getTeacherModuleOrThrow(user.id, moduleId);

    const { exam } = await getAssessmentOrThrow(moduleId);

    res.status(200).json(toAssessmentDTO(exam));
  } catch (error) {
    next(error);
  }
};

export const getAssessmentResults = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const groupId = req.query.groupId as string | undefined;
    await getTeacherModuleOrThrow(user.id, moduleId);

    const results = await getAssessmentResultsService(moduleId, groupId);

    res.status(200).json(results);
  } catch (error) {
    next(error);
  }
};

export const getModuleStudentProgress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const groupId = req.query.groupId as string | undefined;
    await getTeacherModuleOrThrow(user.id, moduleId);

    const progress = await getModuleStudentProgressService(moduleId, groupId);

    res.status(200).json(progress);
  } catch (error) {
    next(error);
  }
};

export const getLabsStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;

    const labWhere = {
      OR: [
        { creatorId: user.id },
        { teachers: { some: { userId: user.id } } },
      ],
    } as any;

    const [totalLabs, labsWithModules, totalGroups, totalStudents] = await Promise.all([
      prisma.lab.count({ where: labWhere }),
      prisma.lab.findMany({
        where: labWhere,
        select: { _count: { select: { modules: true } } },
      }),
      prisma.group.count({ where: { creatorId: user.id } }),
      prisma.groupMember.count({
        where: { group: { creatorId: user.id } },
      }),
    ]);

    const totalModules = labsWithModules.reduce(
      (sum, lab) => sum + lab._count.modules,
      0,
    );

    res.json({ totalLabs, totalModules, totalGroups, totalStudents });
  } catch (error) {
    next(error);
  }
};

export const getModuleProblemAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const groupId = req.query.groupId as string | undefined;
    await getTeacherModuleOrThrow(user.id, moduleId);

    const analytics = await getModuleProblemAnalyticsService(moduleId, groupId);

    res.status(200).json(analytics);
  } catch (error) {
    next(error);
  }
};

export const exportModuleAnalytics = exportModuleAnalyticsFn;

// ── Lab teacher management ──

export const searchTeachers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { q } = req.query as { q?: string };
    if (!q || q.length < 2) {
      return res.status(200).json([]);
    }
    const teachers = await prisma.user.findMany({
      where: {
        globalRoleId: GLOBAL_ROLE_IDS.ORG_TEACHER,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 20,
    });
    res.status(200).json(teachers);
  } catch (error) {
    next(error);
  }
};

export const addLabTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabForWrite(user.id, labId);

    const { email, userId: targetUserId } = req.body as { email?: string; userId?: string };
    if (!email && !targetUserId) {
      return res.status(400).json({ success: false, message: "email or userId is required" });
    }

    const teacher = await prisma.user.findUnique({
      where: targetUserId ? { id: targetUserId } : { email: email! },
      select: { id: true, name: true, email: true, globalRoleId: true },
    });
    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }
    if (teacher.globalRoleId !== GLOBAL_ROLE_IDS.ORG_TEACHER) {
      return res.status(400).json({ success: false, message: "User is not a teacher" });
    }

    const result = await addLabTeacherService(labId, teacher.id, user.id);
    res.status(201).json({
      success: true,
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
    });
  } catch (error) {
    next(error);
  }
};

export const removeLabTeacher = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    const teacherUserId = req.params.teacherUserId as string;
    await getTeacherLabForWrite(user.id, labId);

    if (teacherUserId === user.id) {
      return res.status(400).json({ success: false, message: "Cannot remove yourself" });
    }

    await removeLabTeacherService(labId, teacherUserId);
    res.status(200).json({ success: true, message: "Teacher removed from lab" });
  } catch (error) {
    next(error);
  }
};

export const getLabTeachers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    await getTeacherLabOrThrow(user.id, labId);

    const teachers = await getLabTeachersService(labId);
    res.status(200).json(teachers);
  } catch (error) {
    next(error);
  }
};

// ── Publish / Unpublish / Analytics ──

export const publishLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const parsed = publishLabSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message ?? "Confirmation required",
      });
    }

    const lab = await marketplaceService.publishLab(user.id, labId);
    res.status(200).json(lab);
  } catch (error) {
    next(error);
  }
};

export const unpublishLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const lab = await marketplaceService.unpublishLab(user.id, labId);
    res.status(200).json(lab);
  } catch (error) {
    next(error);
  }
};

export const getLabAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;

    const analytics = await marketplaceService.getLabAnalytics(user.id, labId);
    res.status(200).json(analytics);
  } catch (error) {
    next(error);
  }
};
