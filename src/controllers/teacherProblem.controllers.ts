import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ProgrammingLanguage } from "../../generated/prisma/enums";
import prisma from "@/utils/prisma";
import { GLOBAL_ROLE_IDS } from "@/permissions/role.constants";
import {
  isSupportedLanguageKey,
  supportedLanguageKeys,
} from "@/utils/languageCatalog";
import { runRawCodeService } from "@/services/runReferenceSolution.service";

const languageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => isSupportedLanguageKey(value), {
    message: "Unsupported language",
  });

const defaultDriverCode = Object.fromEntries(
  supportedLanguageKeys.map((language) => [
    language,
    { header: "", template: "", footer: "" },
  ]),
) as Record<string, { header: string; template: string; footer: string }>;

const createProblemSchema = z.object({
  title: z.string().min(1).max(300),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  tags: z.array(z.string()).default([]),
  description: z.string().optional().default(""),
  testCases: z
    .object({
      public: z
        .array(
          z.object({
            id: z.string(),
            input: z.string(),
            output: z.string(),
          }),
        )
        .default([]),
      hidden: z
        .array(
          z.object({
            id: z.string(),
            input: z.string(),
            output: z.string(),
          }),
        )
        .default([]),
    })
    .optional()
    .default({ public: [], hidden: [] }),
  driverCode: z
    .record(
      z.string(),
      z.object({
        header: z.string().optional().default(""),
        template: z.string().optional().default(""),
        footer: z.string().optional().default(""),
      }),
    )
    .optional()
    .default(defaultDriverCode),
  solutions: z
    .array(
      z.object({
        id: z.string(),
        language: languageSchema,
        code: z.string(),
      }),
    )
    .optional()
    .default([]),
  status: z.enum(["DRAFT", "SUBMIT"]).default("DRAFT"),
});

const updateProblemSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  testCases: z
    .object({
      public: z
        .array(
          z.object({
            id: z.string(),
            input: z.string(),
            output: z.string(),
          }),
        )
        .default([]),
      hidden: z
        .array(
          z.object({
            id: z.string(),
            input: z.string(),
            output: z.string(),
          }),
        )
        .default([]),
    })
    .optional(),
  driverCode: z
    .record(
      z.string(),
      z.object({
        header: z.string().optional().default(""),
        template: z.string().optional().default(""),
        footer: z.string().optional().default(""),
      }),
    )
    .optional(),
  solutions: z
    .array(
      z.object({
        id: z.string(),
        language: languageSchema,
        code: z.string(),
      }),
    )
    .optional(),
  status: z.enum(["DRAFT", "SUBMIT"]).optional(),
});

export const createTeacherProblem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const bodyResult = createProblemSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ errors: bodyResult.error.format() });
    }

    const val = bodyResult.data;
    const fullDescription = (val.description || "").trim();
    const isSubmit = val.status === "SUBMIT";

    const maxNumberMatch = await prisma.problem.findFirst({
      orderBy: { number: "desc" },
    });
    const nextNumber = (maxNumberMatch?.number || 0) + 1;

    await prisma.tag.createMany({
      data: val.tags.map((t) => ({ name: t })),
      skipDuplicates: true,
    });

    const dbTags = await prisma.tag.findMany({
      where: { name: { in: val.tags } },
    });

    const publicCasesJson = val.testCases.public.map((t, idx) => ({
      id: t.id || `pub-${idx}`,
      input: t.input,
      output: t.output,
    }));
    const hiddenCasesJson = val.testCases.hidden.map((t, idx) => ({
      id: t.id || `hid-${idx}`,
      input: t.input,
      output: t.output,
    }));

    const problem = await prisma.problem.create({
      data: {
        title: val.title,
        description: fullDescription,
        difficulty: val.difficulty,
        number: nextNumber,
        isPublished: false,
        hidden: false,
        ownerType: "TEACHER",
        ownerId: user.id,
        visibility: "PRIVATE",
        approvalStatus: isSubmit ? "PENDING" : "PENDING",
        tags: {
          create: dbTags.map((t) => ({ tagId: t.id })),
        },
        runTestCase:
          publicCasesJson.length > 0
            ? { create: { cases: publicCasesJson } }
            : undefined,
        testCase:
          hiddenCasesJson.length > 0
            ? { create: { cases: hiddenCasesJson } }
            : undefined,
        driverCode:
          Object.values(val.driverCode).some(
            (dc) => dc.header || dc.template || dc.footer,
          )
            ? {
                create: Object.entries(val.driverCode).map(([lang, codes]) => ({
                  language: lang as ProgrammingLanguage,
                  header: codes.header,
                  template: codes.template,
                  footer: codes.footer,
                })),
              }
            : undefined,
        referenceSolutions:
          val.solutions.length > 0
            ? {
                create: val.solutions.map((sol) => ({
                  language: sol.language as ProgrammingLanguage,
                  code: sol.code,
                })),
              }
            : undefined,
      },
    });

    res.status(201).json({
      id: problem.id,
      message: isSubmit
        ? "Problem submitted for approval successfully"
        : "Draft saved successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getMyProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const { searchValue, difficulty, approvalStatus, take, skip } = req.query;

    const where: any = {
      ownerId: user.id,
      number: { not: 0 },
      AND: [] as any[],
    };

    if (approvalStatus) {
      where.AND.push({ approvalStatus: String(approvalStatus) });
    }

    if (difficulty) {
      where.AND.push({ difficulty: String(difficulty) });
    }

    if (searchValue && String(searchValue).trim() !== "") {
      const search = String(searchValue).trim();
      const parsedNumber = Number(search);
      const orConditions: any[] = [
        { title: { contains: search, mode: "insensitive" } },
        { id: search },
      ];
      if (!Number.isNaN(parsedNumber)) {
        orConditions.push({ number: parsedNumber });
      }
      where.AND.push({ OR: orConditions });
    }

    if (where.AND.length === 0) {
      delete where.AND;
    }

    const total = await prisma.problem.count({ where });

    const problems = await prisma.problem.findMany({
      where,
      take: take ? parseInt(String(take), 10) : 10,
      skip: skip ? parseInt(String(skip), 10) : 0,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        number: true,
        title: true,
        difficulty: true,
        approvalStatus: true,
        rejectionReason: true,
        updatedAt: true,
        createdAt: true,
        tags: {
          select: { tag: true },
        },
      },
    });

    res.status(200).json({
      problems,
      pagination: {
        take: take ? parseInt(String(take), 10) : 10,
        skip: skip ? parseInt(String(skip), 10) : 0,
        total,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTeacherProblemForEditor = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id) {
      return res.status(400).json({ message: "Problem id is required" });
    }

    const problem = await prisma.problem.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        runTestCase: true,
        testCase: true,
        driverCode: true,
        referenceSolutions: true,
        performanceConstraints: true,
        performanceTestCases: true,
      },
    });

    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    if (problem.ownerId !== user.id) {
      return res
        .status(403)
        .json({ message: "You can only view your own problems" });
    }

    const description = problem.description || "";
    const driverCodeResult: any = {};
    problem.driverCode.forEach((dc) => {
      driverCodeResult[dc.language.toLowerCase()] = {
        header: dc.header || "",
        template: dc.template || "",
        footer: dc.footer || "",
      };
    });

    const publicTests = problem.runTestCase?.cases
      ? (problem.runTestCase.cases as any[])
      : [];
    const hiddenTests = problem.testCase?.cases
      ? (problem.testCase.cases as any[])
      : [];

    const result = {
      id: problem.id,
      title: problem.title,
      difficulty: problem.difficulty,
      hidden: problem.hidden,
      tags: problem.tags.map((t) => t.tag.name),
      description,
      testCases: {
        public: publicTests.map((t: any, idx) => ({
          id: t.id || `pub-${idx}`,
          input: t.input,
          output: t.output,
        })),
        hidden: hiddenTests.map((t: any, idx) => ({
          id: t.id || `hid-${idx}`,
          input: t.input,
          output: t.output,
        })),
      },
      driverCode: driverCodeResult,
      solutions: problem.referenceSolutions.map((rs) => ({
        id: rs.id,
        language: rs.language,
        code: rs.code,
      })),
      approvalStatus: problem.approvalStatus,
      rejectionReason: problem.rejectionReason,
      performanceConstraints: problem.performanceConstraints || null,
      performanceTestCases: problem.performanceTestCases || [],
    };

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateTeacherProblem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const existing = await prisma.problem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Problem not found" });
    }
    if (existing.ownerId !== user.id) {
      return res
        .status(403)
        .json({ message: "You can only edit your own problems" });
    }

    const bodyResult = updateProblemSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ errors: bodyResult.error.format() });
    }

    const val = bodyResult.data;
    const isSubmit = val.status === "SUBMIT";

    const updateData: any = {};
    if (val.title !== undefined) updateData.title = val.title;
    if (val.description !== undefined)
      updateData.description = val.description.trim();
    if (val.difficulty !== undefined) updateData.difficulty = val.difficulty;

    if (isSubmit) {
      updateData.approvalStatus = "PENDING";
      updateData.approvedAt = null;
      updateData.approvedById = null;
      updateData.rejectionReason = null;
    }

    // Handle tags
    if (val.tags !== undefined) {
      await prisma.tag.createMany({
        data: val.tags.map((t) => ({ name: t })),
        skipDuplicates: true,
      });
      const dbTags = await prisma.tag.findMany({
        where: { name: { in: val.tags } },
      });
      await prisma.problemTag.deleteMany({ where: { problemId: id } });
      await prisma.problemTag.createMany({
        data: dbTags.map((t) => ({ problemId: id, tagId: t.id })),
      });
    }

    // Handle test cases
    if (val.testCases !== undefined) {
      const publicCasesJson = val.testCases.public.map((t, idx) => ({
        id: t.id || `pub-${idx}`,
        input: t.input,
        output: t.output,
      }));
      const hiddenCasesJson = val.testCases.hidden.map((t, idx) => ({
        id: t.id || `hid-${idx}`,
        input: t.input,
        output: t.output,
      }));

      await prisma.runTestCase.deleteMany({ where: { problemId: id } });
      await prisma.testCase.deleteMany({ where: { problemId: id } });

      if (publicCasesJson.length > 0) {
        await prisma.runTestCase.create({
          data: { problemId: id, cases: publicCasesJson },
        });
      }
      if (hiddenCasesJson.length > 0) {
        await prisma.testCase.create({
          data: { problemId: id, cases: hiddenCasesJson },
        });
      }
    }

    // Handle driver code
    if (val.driverCode !== undefined) {
      await prisma.driverCode.deleteMany({ where: { problemId: id } });
      const hasNonEmpty = Object.values(val.driverCode).some(
        (dc) => dc.header || dc.template || dc.footer,
      );
      if (hasNonEmpty) {
        await prisma.driverCode.createMany({
          data: Object.entries(val.driverCode).map(([lang, codes]) => ({
            problemId: id,
            language: lang as ProgrammingLanguage,
            header: codes.header,
            template: codes.template,
            footer: codes.footer,
          })),
        });
      }
    }

    // Handle reference solutions
    if (val.solutions !== undefined) {
      await prisma.referenceSolution.deleteMany({ where: { problemId: id } });
      if (val.solutions.length > 0) {
        await prisma.referenceSolution.createMany({
          data: val.solutions.map((sol) => ({
            problemId: id,
            language: sol.language as ProgrammingLanguage,
            code: sol.code,
          })),
        });
      }
    }

    // Apply basic field updates
    if (Object.keys(updateData).length > 0) {
      await prisma.problem.update({
        where: { id },
        data: updateData,
      });
    }

    res.status(200).json({
      message: isSubmit
        ? "Problem submitted for approval successfully"
        : "Draft updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTeacherProblem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const existing = await prisma.problem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Problem not found" });
    }
    if (existing.ownerId !== user.id) {
      return res
        .status(403)
        .json({ message: "You can only delete your own problems" });
    }

    const usedInExam = await prisma.examProblem.findFirst({
      where: { problemId: id },
    });
    const usedInModule = await prisma.moduleProblem.findFirst({
      where: { problemId: id },
    });
    if (usedInExam || usedInModule) {
      return res.status(409).json({
        message:
          "Cannot delete a problem that is already used in exams or modules",
      });
    }

    await prisma.problem.delete({ where: { id } });
    res.status(200).json({ message: "Problem deleted" });
  } catch (error) {
    next(error);
  }
};

export const resubmitProblem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user!;
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const existing = await prisma.problem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Problem not found" });
    }
    if (existing.ownerId !== user.id) {
      return res
        .status(403)
        .json({ message: "You can only resubmit your own problems" });
    }
    if (existing.approvalStatus !== "REJECTED") {
      return res
        .status(400)
        .json({ message: "Only rejected problems can be resubmitted" });
    }

    await prisma.problem.update({
      where: { id },
      data: {
        approvalStatus: "PENDING",
        rejectionReason: null,
      },
    });

    res.status(200).json({ message: "Problem resubmitted for approval" });
  } catch (error) {
    next(error);
  }
};

export const runTeacherReferenceSolution = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const runSchema = z.object({
      languageId: z.number().int().optional(),
      code: z.string(),
      cases: z
        .array(
          z.object({
            input: z.string(),
            output: z.string(),
          }),
        )
        .default([]),
    });

    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.format() });
    }

    const { languageId, code, cases } = parsed.data;
    const result = await runRawCodeService(req, {
      languageId,
      code,
      cases,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
