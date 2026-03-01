// ...existing code...

import prisma from "@/utils/prisma";
import { NextFunction, Request, Response } from "express";

export const getGroupOverallStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.creatorId !== user.id)
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.groupOverallStats.findUnique({
      where: { groupId },
    });

    return res.status(200).json(stats ?? null);
  } catch (error) {
    next(error);
  }
};

export const getGroupProblemStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);
    const { take, skip, searchValue } = req.query;

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.creatorId !== user.id)
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.groupProblemStats.findMany({
      where: {
        groupId,
        ...(searchValue && {
          problem: {
            title: { contains: String(searchValue), mode: "insensitive" },
          },
        }),
      },
      include: {
        problem: {
          select: {
            id: true,
            number: true,
            title: true,
            difficulty: true,
          },
        },
      },
      take: Number(take) ?? 10,
      skip: Number(skip) ?? 0,
      orderBy: { attemptedCount: "desc" },
    });

    return res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

export const getStudentOverallStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    if (!groupId) return res.status(400).json({ error: "groupId is required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.creatorId !== user.id)
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.studentOverallStats.findMany({
      where: { groupId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { avgScore: "desc" },
    });

    return res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

export const getStudentProblemStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);
    const studentId = String(req.query.studentId);

    if (!groupId || !studentId)
      return res
        .status(400)
        .json({ error: "groupId and studentId are required" });

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.creatorId !== user.id)
      return res.status(403).json({ error: "Not authorized" });

    const stats = await prisma.studentProblemStats.findMany({
      where: { groupId, studentId },
      include: {
        problem: {
          select: {
            id: true,
            number: true,
            title: true,
            difficulty: true,
          },
        },
      },
      orderBy: { attempts: "desc" },
    });

    return res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};
