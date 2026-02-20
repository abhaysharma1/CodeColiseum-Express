import prisma from "@/utils/prisma";
import { NextFunction, Request, Response } from "express";

export async function getAllGroups(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user;

    const { take, skip, searchValue } = req.query;

    let groups;

    if (!searchValue || searchValue == "") {
      groups = await prisma.group.findMany({
        where: {
          members: {
            some: {
              studentId: user.id,
            },
          },
        },
        take: Number(take),
        skip: Number(skip),
        include: {
          creator: true,
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      groups = await prisma.group.findMany({
        where: {
          name: { contains: String(searchValue), mode: "insensitive" },
          members: {
            some: {
              studentId: user.id,
            },
          },
        },
        take: Number(take),
        skip: Number(skip),

        include: {
          creator: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return res.status(200).json(groups);
  } catch (error) {
    next(error);
  }
}

export async function getGroupData(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user;
    const groupId = String(req.query.groupId);

    const groupData = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!groupData) {
      throw new Error("No Group Found");
    }

    const canAccessGroup = await prisma.groupMember.findUnique({
      where: {
        groupId_studentId: {
          groupId: groupData.id,
          studentId: user.id,
        },
      },
    });

    if (!canAccessGroup) {
      throw new Error("You Don't have access to this Group");
    }

    return res.status(200).json(groupData);
  } catch (error) {
    next(error);
  }
}

export async function getGroupExams(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user;
    const { groupId, take, skip, searchValue } = req.query;
    const groupData = await prisma.group.findUnique({
      where: { id: String(groupId) },
    });

    if (!groupData) {
      throw new Error("No Group Found");
    }

    const canAccessGroup = await prisma.groupMember.findUnique({
      where: {
        groupId_studentId: {
          groupId: groupData.id,
          studentId: user.id,
        },
      },
    });

    if (!canAccessGroup) {
      throw new Error("You Don't have access to this Group");
    }

    let groupExams;

    if (searchValue == "") {
      groupExams = await prisma.exam.findMany({
        where: {
          examGroups: {
            some: {
              groupId: groupData.id,
            },
          },
        },
        take: Number(take),
        skip: Number(skip),
        orderBy: {
          endDate: "desc",
        },
      });
    } else {
      groupExams = await prisma.exam.findMany({
        where: {
          title: { contains: String(searchValue), mode: "insensitive" },
          examGroups: {
            some: {
              groupId: groupData.id,
            },
          },
        },
        take: Number(take),
        skip: Number(skip),
        orderBy: {
          endDate: "desc",
        },
      });
    }

    return res.status(200).json(groupExams);
  } catch (error) {
    next(error);
  }
}

export async function getGroupCreator(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user;
    const groupId = req.query.groupId;

    const groupData = await prisma.group.findUnique({
      where: { id: String(groupId) },
    });

    if (!groupData) {
      throw new Error("No Group Found");
    }

    const canAccessGroup = await prisma.groupMember.findUnique({
      where: {
        groupId_studentId: {
          groupId: groupData.id,
          studentId: user.id,
        },
      },
    });

    if (!canAccessGroup) {
      throw new Error("You Don't have access to this Group");
    }

    const creatorData = await prisma.user.findUnique({
      where: {
        id: groupData.creatorId,
      },
    });

    if (!creatorData) {
      throw new Error("Couldn't find Creator");
    }

    return res.status(200).json(creatorData);
  } catch (error) {
    next(error);
  }
}
