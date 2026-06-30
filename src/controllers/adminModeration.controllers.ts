import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import prisma from "@/utils/prisma";

const moderationSearchSchema = z.object({
  searchValue: z.string().optional(),
  take: z.string().optional(),
  skip: z.string().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});

function buildModerationQuery(approvalStatus: string) {
  return (req: Request, res: Response, next: NextFunction) =>
    listModerationProblems(req, res, next, approvalStatus);
}

async function listModerationProblems(
  req: Request,
  res: Response,
  next: NextFunction,
  approvalStatus: string,
) {
  try {
    const { searchValue, take, skip } = req.query;

    const where: any = {
      ownerType: "TEACHER",
      approvalStatus,
      AND: [] as any[],
    };

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
      take: take ? parseInt(String(take), 10) : 20,
      skip: skip ? parseInt(String(skip), 10) : 0,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        number: true,
        title: true,
        difficulty: true,
        approvalStatus: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        ownerId: true,
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(200).json({
      problems,
      pagination: {
        take: take ? parseInt(String(take), 10) : 20,
        skip: skip ? parseInt(String(skip), 10) : 0,
        total,
      },
    });
  } catch (error) {
    next(error);
  }
}

export const getPendingProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => listModerationProblems(req, res, next, "PENDING");

export const getRejectedProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => listModerationProblems(req, res, next, "REJECTED");

export const getApprovedTeacherProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => listModerationProblems(req, res, next, "APPROVED");

export const approveProblem = async (
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
    if (existing.ownerType !== "TEACHER") {
      return res.status(400).json({ message: "Only teacher-created problems can be moderated" });
    }

    await prisma.problem.update({
      where: { id },
      data: {
        approvalStatus: "APPROVED",
        visibility: "PUBLIC",
        approvedAt: new Date(),
        approvedById: user.id,
        rejectionReason: null,
      },
    });

    res.status(200).json({ message: "Problem approved successfully" });
  } catch (error) {
    next(error);
  }
};

export const rejectProblem = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const bodyResult = rejectSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ errors: bodyResult.error.format() });
    }

    const existing = await prisma.problem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Problem not found" });
    }
    if (existing.ownerType !== "TEACHER") {
      return res.status(400).json({ message: "Only teacher-created problems can be moderated" });
    }

    await prisma.problem.update({
      where: { id },
      data: {
        approvalStatus: "REJECTED",
        visibility: "PRIVATE",
        rejectionReason: bodyResult.data.reason,
        approvedAt: null,
        approvedById: null,
      },
    });

    res.status(200).json({ message: "Problem rejected" });
  } catch (error) {
    next(error);
  }
};
