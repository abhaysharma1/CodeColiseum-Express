import prisma from "@/utils/prisma";
import { NextFunction, Request, Response } from "express";

export const getProblems = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { searchValue, tags, difficulty, take, skip } = req.query;

    const where: any = {};

    // Add search conditions
    if (searchValue && String(searchValue).trim() !== "") {
      where.OR = [
        { title: { contains: String(searchValue), mode: "insensitive" } },
        { description: { contains: String(searchValue), mode: "insensitive" } },
        { id: String(searchValue) },
      ];
    }

    // Add tag filter
    if (tags) {
      where.tags = {
        some: { name: String(tags) },
      };
    }

    // Add difficulty filter
    if (difficulty) {
      where.difficulty = String(difficulty);
    }

    // Fetch problems from the database
    const problems = await prisma.problem.findMany({
      where,
      take: take ? parseInt(String(take), 10) : 10,
      skip: skip ? parseInt(String(skip), 10) : 0,
      orderBy: { number: "asc" },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    return res.status(200).json(problems);
  } catch (error) {
    next(error);
  }
};

export const getProblemTags = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const data = await prisma.tag.findMany({});

  return res.status(200).json(data);
};
