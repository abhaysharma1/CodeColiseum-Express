import { NextFunction, Request, Response } from "express";
import prisma from "@/utils/prisma";
import {
  getStudentLabIds,
  getAssessmentOrThrow,
  toAssessmentDTO,
  computeModuleStatus,
  getModuleProblemProgress,
} from "@/services/lab.service";

export const getMyLabs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labIds = await getStudentLabIds(user.id);
    if (labIds.length === 0) {
      return res.status(200).json([]);
    }

    const labs = await prisma.lab.findMany({
      where: { id: { in: labIds } },
      include: {
        modules: {
          include: { _count: { select: { problems: true } } },
          orderBy: [{ orderIndex: "asc" }, { weekNumber: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = await Promise.all(
      labs.map(async (lab: any) => {
        const visibleModules = await Promise.all(
          lab.modules
            .filter((m: any) => {
              if (m.unlockAt && m.unlockAt > new Date()) return false;
              return true;
            })
            .map(async (m: any) => {
              const [completedProblems, totalProblems, moduleStatus, progress] =
                await Promise.all([
                  prisma.moduleProblemProgress.count({
                    where: {
                      moduleProblem: { moduleId: m.id },
                      userId: user.id,
                      isSolved: true,
                    },
                  }),
                  prisma.moduleProblem.count({ where: { moduleId: m.id } }),
                  computeModuleStatus(user.id, m.id, m.assessmentExamId),
                  getModuleProblemProgress(user.id, m.id),
                ]);

              let assessment = null;
              if (m.assessmentExamId) {
                try {
                  const { exam } = await getAssessmentOrThrow(m.id);
                  assessment = toAssessmentDTO(exam);
                } catch {
                  // linked exam missing, skip
                }
              }

              return {
                id: m.id,
                title: m.title,
                description: m.description,
                weekNumber: m.weekNumber,
                orderIndex: m.orderIndex,
                unlockAt: m.unlockAt,
                dueAt: m.dueAt,
                problemsCount: m._count.problems,
                completedProblems,
                totalProblems,
                completionPercentage:
                  totalProblems > 0
                    ? Math.round((completedProblems / totalProblems) * 100)
                    : 0,
                moduleStatus,
                progress,
                assessment,
              };
            }),
        );

        return {
          id: lab.id,
          title: lab.title,
          description: lab.description,
          modulesCount: visibleModules.length,
          modules: visibleModules,
        };
      }),
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getMyLab = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const labId = req.params.labId as string;
    const labIds = await getStudentLabIds(user.id);

    if (!labIds.includes(labId)) {
      return res.status(404).json({ success: false, message: "Lab not found" });
    }

    const lab = await prisma.lab.findUnique({
      where: { id: labId },
      include: {
        modules: {
          include: { _count: { select: { problems: true } } },
          orderBy: [{ orderIndex: "asc" }, { weekNumber: "asc" }],
        },
      },
    });

    if (!lab) {
      return res.status(404).json({ success: false, message: "Lab not found" });
    }

    const visibleModules = await Promise.all(
      (lab as any).modules
        .filter((m: any) => {
          if (m.unlockAt && m.unlockAt > new Date()) return false;
          return true;
        })
        .map(async (m: any) => {
          const [completedProblems, totalProblems, moduleStatus, progress] =
            await Promise.all([
              prisma.moduleProblemProgress.count({
                where: {
                  moduleProblem: { moduleId: m.id },
                  userId: user.id,
                  isSolved: true,
                },
              }),
              prisma.moduleProblem.count({ where: { moduleId: m.id } }),
              computeModuleStatus(user.id, m.id, m.assessmentExamId),
              getModuleProblemProgress(user.id, m.id),
            ]);

          let assessment = null;
          if (m.assessmentExamId) {
            try {
              const { exam } = await getAssessmentOrThrow(m.id);
              assessment = toAssessmentDTO(exam);
            } catch {
              // skip
            }
          }

          return {
            id: m.id,
            title: m.title,
            description: m.description,
            weekNumber: m.weekNumber,
            orderIndex: m.orderIndex,
            unlockAt: m.unlockAt,
            dueAt: m.dueAt,
            problemsCount: m._count.problems,
            completedProblems,
            totalProblems,
            completionPercentage:
              totalProblems > 0
                ? Math.round((completedProblems / totalProblems) * 100)
                : 0,
            moduleStatus,
            progress,
            assessment,
          };
        }),
    );

    res.status(200).json({
      id: lab.id,
      title: lab.title,
      description: lab.description,
      modulesCount: visibleModules.length,
      modules: visibleModules,
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
    const labIds = await getStudentLabIds(user.id);

    const module = await prisma.labModule.findUnique({
      where: { id: moduleId },
      select: {
        id: true,
        unlockAt: true,
        assessmentExamId: true,
        labId: true,
        title: true,
        weekNumber: true,
        dueAt: true,
        description: true,
        orderIndex: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!module || !labIds.includes(module.labId)) {
      return res.status(404).json({ success: false, message: "Module not found" });
    }

    if (module.unlockAt && module.unlockAt > new Date()) {
      return res.status(403).json({ success: false, message: "Module is locked" });
    }

    const problems = await prisma.moduleProblem.findMany({
      where: { moduleId },
      include: {
        problem: {
          select: { id: true, number: true, title: true, difficulty: true },
        },
        progress: {
          where: { userId: user.id },
          select: {
            attemptCount: true,
            isSolved: true,
            lastAttemptAt: true,
          },
        },
      },
      orderBy: { orderIndex: "asc" },
    });

    const totalProblems = problems.length;
    const completedProblems = problems.filter(
      (p: any) => p.progress.length > 0 && p.progress[0].isSolved,
    ).length;

    let assessment = null;
    if (module.assessmentExamId) {
      try {
        const { exam } = await getAssessmentOrThrow(moduleId);
        assessment = toAssessmentDTO(exam);
      } catch {
        // skip
      }
    }

    res.status(200).json({
      module: {
        id: module.id,
        title: module.title,
        description: module.description,
        weekNumber: module.weekNumber,
        orderIndex: module.orderIndex,
        unlockAt: module.unlockAt,
        dueAt: module.dueAt,
        assessmentExamId: module.assessmentExamId,
      },
      completedProblems,
      totalProblems,
      completionPercentage:
        totalProblems > 0
          ? Math.round((completedProblems / totalProblems) * 100)
          : 0,
      assessment,
      problems: problems.map((p: any) => ({
        id: p.id,
        moduleId: p.moduleId,
        problemId: p.problemId,
        orderIndex: p.orderIndex,
        problem: p.problem,
        progress: p.progress[0] || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getModuleProgress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const labIds = await getStudentLabIds(user.id);

    const module = await prisma.labModule.findUnique({
      where: { id: moduleId },
      select: { labId: true },
    });

    if (!module || !labIds.includes(module.labId)) {
      return res.status(404).json({ success: false, message: "Module not found" });
    }

    const progress = await getModuleProblemProgress(user.id, moduleId);

    res.status(200).json({
      problems: progress,
    });
  } catch (error) {
    next(error);
  }
};

export const getModuleAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleId = req.params.moduleId as string;
    const labIds = await getStudentLabIds(user.id);

    const module = await prisma.labModule.findUnique({
      where: { id: moduleId },
      select: { labId: true, assessmentExamId: true },
    });

    if (!module || !labIds.includes(module.labId)) {
      return res.status(404).json({ success: false, message: "Module not found" });
    }

    const { exam } = await getAssessmentOrThrow(moduleId);

    res.status(200).json(toAssessmentDTO(exam));
  } catch (error) {
    next(error);
  }
};

export const getModuleProblem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const moduleProblemId = req.params.moduleProblemId as string;
    const labIds = await getStudentLabIds(user.id);

    const moduleProblem = await prisma.moduleProblem.findUnique({
      where: { id: moduleProblemId },
      include: {
        module: {
          include: { lab: { select: { id: true, title: true, description: true } } },
        },
        problem: { select: { id: true } },
      },
    });

    if (!moduleProblem) {
      return res.status(404).json({ success: false, message: "ModuleProblem not found" });
    }

    if (!labIds.includes(moduleProblem.module.lab.id)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (moduleProblem.module.unlockAt && moduleProblem.module.unlockAt > new Date()) {
      return res.status(403).json({ success: false, message: "Module is locked" });
    }

    const progress = await prisma.moduleProblemProgress.findUnique({
      where: {
        userId_moduleProblemId: {
          userId: user.id,
          moduleProblemId,
        },
      },
    });

    const allModuleProblems = await prisma.moduleProblem.findMany({
      where: { moduleId: moduleProblem.moduleId },
      orderBy: { orderIndex: "asc" },
      select: { id: true, problemId: true, orderIndex: true },
    });

    const currentIndex = allModuleProblems.findIndex(
      (mp: any) => mp.id === moduleProblemId,
    );

    const previousProblem = currentIndex > 0 ? allModuleProblems[currentIndex - 1] : null;
    const nextProblem =
      currentIndex < allModuleProblems.length - 1
        ? allModuleProblems[currentIndex + 1]
        : null;

    res.status(200).json({
      moduleProblem: {
        id: moduleProblem.id,
        moduleId: moduleProblem.moduleId,
        problemId: moduleProblem.problemId,
        orderIndex: moduleProblem.orderIndex,
      },
      module: {
        id: moduleProblem.module.id,
        title: moduleProblem.module.title,
        description: moduleProblem.module.description,
        weekNumber: moduleProblem.module.weekNumber,
        orderIndex: moduleProblem.module.orderIndex,
        unlockAt: moduleProblem.module.unlockAt,
        dueAt: moduleProblem.module.dueAt,
        assessmentExamId: moduleProblem.module.assessmentExamId,
      },
      lab: {
        id: moduleProblem.module.lab.id,
        title: moduleProblem.module.lab.title,
        description: moduleProblem.module.lab.description,
      },
      progress: progress
        ? {
            attemptCount: progress.attemptCount,
            isSolved: progress.isSolved,
            solvedAt: progress.solvedAt,
            lastAttemptAt: progress.lastAttemptAt,
          }
        : null,
      previousProblem,
      nextProblem,
    });
  } catch (error) {
    next(error);
  }
};
