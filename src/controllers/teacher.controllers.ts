import { PERMISSIONS } from "@/permissions/permission.constants";
import { hasPermission } from "@/permissions/permission.service";
import prisma from "@/utils/prisma";
import { sendBatchToSQS } from "@/utils/sqs";
import { NextFunction, Request, Response } from "express";
import { Group } from "generated/prisma/client";
import { z } from "zod";

async function getExamGroupId(examId: string): Promise<string | undefined> {
  const examGroup = await prisma.examGroup.findFirst({
    where: { examId },
    select: { groupId: true },
  });

  return examGroup?.groupId;
}

async function canAccessExamWithFallback(
  userId: string,
  examId: string,
  creatorId: string,
  permission: string,
): Promise<boolean> {
  const groupId = await getExamGroupId(examId);
  const allowed = await hasPermission(userId, permission, groupId);
  return allowed || creatorId === userId;
}

async function canAccessGroupWithFallback(
  userId: string,
  groupId: string,
  creatorId: string,
  permission: string,
): Promise<boolean> {
  const allowed = await hasPermission(userId, permission, groupId);
  return allowed || creatorId === userId;
}

const DEFAULT_GROUP_MEMBER_ROLE_ID = "role_group_member";

export const fetchAllExams = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const take = Number(req.query.take) ?? 10;
    const skip = Number(req.query.skip) ?? 0;
    const searchValue = String(req.query.searchvalue) ?? "";

    const exams = await prisma.exam.findMany({
      where: {
        ...(searchValue
          ? {
              title: { contains: searchValue, mode: "insensitive" },
            }
          : {}),
      },
      orderBy: { endDate: "desc" },
    });

    const authorizedExams: typeof exams = [];
    for (const exam of exams) {
      if (
        await canAccessExamWithFallback(
          user.id,
          exam.id,
          exam.creatorId,
          PERMISSIONS.EXAM_EDIT,
        )
      ) {
        authorizedExams.push(exam);
      }
    }

    const paginatedExams = authorizedExams.slice(skip, skip + take);

    return res.status(200).json(paginatedExams);
  } catch (error) {
    next(error);
  }
};

export const draftExam = async (req: Request, res: Response) => {
  const user = req.user;

  const now = new Date();

  const exam = await prisma.exam.create({
    data: {
      title: "Untitled Exam",
      description: "",
      isPublished: false,
      creatorId: user.id,
      startDate: now,
      endDate: new Date(now.getTime() + 60 * 60 * 1000), // +1 hour
      durationMin: 60,
      sebEnabled: false,
      status: "scheduled",
    },
  });

  return res.status(201).json(exam);
};

export const getExam = async (req: Request, res: Response) => {
  const user = req.user;
  const examId = String(req.query.examId);

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
  });

  if (!exam) {
    return res.status(404).json({
      error: "Exam Not Found or you don't have access to it",
    });
  }

  if (
    !(await canAccessExamWithFallback(
      user.id,
      exam.id,
      exam.creatorId,
      PERMISSIONS.EXAM_EDIT,
    ))
  ) {
    return res.status(404).json({
      error: "Exam Not Found or you don't have access to it",
    });
  }

  if (exam.isPublished) {
    return res.status(400).json({
      error: "Exam cannot be edited once it has been published",
    });
  }

  return res.status(200).json(exam);
};

export const getAllGroupExams = async (req: Request, res: Response) => {
  const user = req.user;
  const examId = String(req.query.examId);

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!exam) {
    return res.status(404).json({ error: "Exam not found" });
  }

  if (
    !(await canAccessExamWithFallback(
      user.id,
      exam.id,
      exam.creatorId,
      PERMISSIONS.EXAM_EDIT,
    ))
  ) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const groups = await prisma.group.findMany({
    where: {
      examGroups: {
        some: {
          examId: examId,
        },
      },
    },
  });

  return res.status(200).json(groups);
};

export const getAllExamProblem = async (req: Request, res: Response) => {
  const user = req.user;
  const examId = String(req.query.examId);

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!exam) {
    return res.status(404).json({ error: "Exam not found" });
  }

  if (
    !(await canAccessExamWithFallback(
      user.id,
      exam.id,
      exam.creatorId,
      PERMISSIONS.EXAM_EDIT,
    ))
  ) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const problems = await prisma.examProblem.findMany({
    where: {
      examId: examId,
    },
    select: {
      id: true,
    },
  });

  return res.status(200).json({ problems });
};

export const saveDraft = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const { updatedExamDetails, selectedGroups, selectedProblemsId } = req.body;

    // Fetch the exam and validate access
    const exam = await prisma.exam.findUnique({
      where: { id: updatedExamDetails.id },
    });

    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }

    if (
      !(await canAccessExamWithFallback(
        user.id,
        exam.id,
        exam.creatorId,
        PERMISSIONS.EXAM_EDIT,
      ))
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (exam.isPublished) {
      return res.status(400).json({ error: "Published Exam cannot be edited" });
    }

    // Perform the transaction
    await prisma.$transaction(async (tx) => {
      // Update exam details
      await tx.exam.update({
        where: { id: updatedExamDetails.id },
        data: {
          title: updatedExamDetails.title,
          description: updatedExamDetails.description || "",
          isPublished: false,
          startDate: updatedExamDetails.startDate,
          endDate: updatedExamDetails.endDate,
          durationMin: updatedExamDetails.durationMin,
          sebEnabled: updatedExamDetails.sebEnabled,
        },
      });

      // Remove existing group associations
      await tx.examGroup.deleteMany({ where: { examId: exam.id } });

      // Add new group associations
      await tx.examGroup.createMany({
        data: selectedGroups.map((group: Group) => ({
          examId: exam.id,
          groupId: group.id,
        })),
      });

      // Remove existing problem associations
      await tx.examProblem.deleteMany({ where: { examId: exam.id } });

      // Add new problem associations
      await tx.examProblem.createMany({
        data: selectedProblemsId.map((problemId: String, index: number) => ({
          examId: exam.id,
          problemId: problemId,
          order: index + 1,
        })),
      });
    });

    return res.status(200).json({ message: "Draft saved successfully" });
  } catch (error) {
    next(error);
  }
};

export const publishExam = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const { updatedExamDetails, selectedGroups, selectedProblemsId } = req.body;

    // Fetch the exam and validate access
    const exam = await prisma.exam.findUnique({
      where: { id: updatedExamDetails.id },
    });

    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }

    if (
      !(await canAccessExamWithFallback(
        user.id,
        exam.id,
        exam.creatorId,
        PERMISSIONS.EXAM_PUBLISH,
      ))
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (exam.isPublished) {
      return res.status(400).json({ error: "Published Exam cannot be edited" });
    }

    // Perform the transaction
    await prisma.$transaction(async (tx) => {
      // Update exam details
      await tx.exam.update({
        where: { id: updatedExamDetails.id },
        data: {
          title: updatedExamDetails.title,
          description: updatedExamDetails.description || "",
          isPublished: true,
          startDate: updatedExamDetails.startDate,
          endDate: updatedExamDetails.endDate,
          durationMin: updatedExamDetails.durationMin,
          sebEnabled: updatedExamDetails.sebEnabled,
        },
      });

      // Remove existing group associations
      await tx.examGroup.deleteMany({ where: { examId: exam.id } });

      // Add new group associations
      await tx.examGroup.createMany({
        data: selectedGroups.map((group: Group) => ({
          examId: exam.id,
          groupId: group.id,
        })),
      });

      // Remove existing problem associations
      await tx.examProblem.deleteMany({ where: { examId: exam.id } });

      // Validate selected problems
      const problems = await tx.problem.findMany({
        where: { id: { in: selectedProblemsId } },
        select: { id: true },
      });

      if (problems.length !== selectedProblemsId.length) {
        throw new Error("One or more selected problems no longer exist");
      }

      // Add new problem associations
      await tx.examProblem.createMany({
        data: selectedProblemsId.map((problemId: string, index: number) => ({
          examId: exam.id,
          problemId: problemId,
          order: index + 1,
        })),
      });
    });

    return res.status(200).json({ message: "Exam published successfully" });
  } catch (error) {
    next(error);
  }
};

export const getAllGroups = async (req: Request, res: Response) => {
  const user = req.user;
  const { take, skip, searchValue, groupType } = req.query;
  const takeNumber = Number(take) ?? 10;
  const skipNumber = Number(skip) ?? 0;

  let where: any = {};


  if (groupType == "CLASS" || groupType == "LAB") {
    where.type = groupType;
  }

  if (searchValue) {
    const searchString = String(searchValue);
    where.OR = [
      { name: { contains: searchString, mode: "insensitive" } },
      { description: { contains: searchString, mode: "insensitive" } },
    ];
  }

  const groups = await prisma.group.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
  });

  const authorizedGroups: typeof groups = [];
  for (const group of groups) {
    if (
      await canAccessGroupWithFallback(
        user.id,
        group.id,
        group.creatorId,
        PERMISSIONS.GROUP_VIEW,
      )
    ) {
      authorizedGroups.push(group);
    }
  }

  const paginatedGroups = authorizedGroups.slice(skipNumber, skipNumber + takeNumber);

  return res.status(200).json(paginatedGroups);
};

export const getExamResults = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const examId = String(req.query.examId);
  try {
    const user = req.user;

    if (!user || user.role !== "TEACHER") {
      return res
        .status(403)
        .json({ error: "Not authorized. Teacher access required." });
    }

    const examId = req.query.examId as string;

    if (!examId) {
      return res.status(400).json({ error: "examId is required" });
    }

    // Fetch exam details and verify teacher owns it
    const examDetails = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        problems: {
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
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!examDetails) {
      return res.status(404).json({ error: "Exam not found" });
    }

    if (
      !(await canAccessExamWithFallback(
        user.id,
        examDetails.id,
        examDetails.creatorId,
        PERMISSIONS.SUBMISSION_VIEW,
      ))
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this exam's results" });
    }

    // Fetch all exam attempts for this exam
    const examAttempts = await prisma.examAttempt.findMany({
      where: {
        examId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        submissions: {
          select: {
            id: true,
            problemId: true,
            status: true,
            passedTestcases: true,
            totalTestcases: true,
            createdAt: true,
            isFinal: true,
            sourceCode: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: [{ totalScore: "desc" }, { submittedAt: "asc" }],
    });

    // Process student results
    const studentResults = examAttempts.map((attempt) => {
      const problemSubmissions = new Map<string, typeof attempt.submissions>();

      attempt.submissions.forEach((sub) => {
        if (!problemSubmissions.has(sub.problemId)) {
          problemSubmissions.set(sub.problemId, []);
        }
        problemSubmissions.get(sub.problemId)!.push(sub);
      });

      const problemScores = examDetails.problems.map((examProblem) => {
        const submissions = problemSubmissions.get(examProblem.problemId) || [];

        let bestScore = 0;
        let latestStatus: string | null = null;
        let passedTestcases = 0;
        let totalTestcases = 0;
        let sourceCode: string | null = null;

        if (submissions.length > 0) {
          const bestSubmission = submissions.reduce((best, current) => {
            const currentScore =
              current.totalTestcases > 0
                ? (current.passedTestcases / current.totalTestcases) * 100
                : 0;
            const bestCurrentScore =
              best.totalTestcases > 0
                ? (best.passedTestcases / best.totalTestcases) * 100
                : 0;

            return currentScore > bestCurrentScore ? current : best;
          });

          bestScore =
            bestSubmission.totalTestcases > 0
              ? Math.round(
                  (bestSubmission.passedTestcases /
                    bestSubmission.totalTestcases) *
                    100,
                )
              : 0;
          latestStatus = bestSubmission.status;
          passedTestcases = bestSubmission.passedTestcases;
          totalTestcases = bestSubmission.totalTestcases;
          sourceCode = bestSubmission.sourceCode;
        }

        return {
          problemId: examProblem.problemId,
          problemTitle: examProblem.problem.title,
          problemNumber: examProblem.problem.number,
          bestScore,
          attempts: submissions.length,
          latestStatus,
          passedTestcases,
          totalTestcases,
          sourceCode,
        };
      });

      const totalScore =
        examDetails.problems.length > 0
          ? Math.round(
              problemScores.reduce(
                (sum, problem) => sum + problem.bestScore,
                0,
              ) / examDetails.problems.length,
            )
          : 0;

      return {
        studentId: attempt.student.id,
        studentName: attempt.student.name,
        studentEmail: attempt.student.email,
        attemptId: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        expiresAt: attempt.expiresAt,
        totalScore: totalScore,
        lastHeartbeatAt: attempt.lastHeartbeatAt,
        disconnectCount: attempt.disconnectCount,
        problemScores,
      };
    });

    // Calculate statistics
    const submittedAttempts = examAttempts.filter(
      (a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED",
    );
    const inProgressAttempts = examAttempts.filter(
      (a) => a.status === "IN_PROGRESS",
    );
    const notStartedAttempts = examAttempts.filter(
      (a) => a.status === "NOT_STARTED",
    );

    const scores = studentResults
      .filter(
        (result) =>
          result.status === "SUBMITTED" || result.status === "AUTO_SUBMITTED",
      )
      .map((result) => result.totalScore);

    const averageScore =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
    const completionRate =
      examAttempts.length > 0
        ? (submittedAttempts.length / examAttempts.length) * 100
        : 0;

    const statistics = {
      totalStudents: examAttempts.length,
      submitted: submittedAttempts.length,
      inProgress: inProgressAttempts.length,
      notStarted: notStartedAttempts.length,
      averageScore: Math.round(averageScore * 100) / 100,
      highestScore,
      lowestScore,
      completionRate: Math.round(completionRate * 100) / 100,
    };

    return res.status(200).json({
      examDetails: {
        id: examDetails.id,
        title: examDetails.title,
        description: examDetails.description,
        durationMin: examDetails.durationMin,
        startDate: examDetails.startDate,
        endDate: examDetails.endDate,
        isPublished: examDetails.isPublished,
        status: examDetails.status,
        sebEnabled: examDetails.sebEnabled,
        problems: examDetails.problems.map((ep) => ({
          order: ep.order,
          problem: ep.problem,
        })),
      },
      studentResults,
      statistics,
    });
  } catch (error) {
    console.error("Error fetching teacher test results:", error);
    next(error);
  }
};

export const getExamAIResults = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const examId = req.query.examId as string;

    if (!examId) {
      return res.status(400).json({ error: "examId is required" });
    }

    // Fetch the exam and validate access
    const exam = await prisma.exam.findUnique({
      where: {
        id: examId,
      },
      include: {
        creator: true,
      },
    });

    if (!exam) {
      return res.status(404).json({ error: "Exam Not Found" });
    }

    if (
      !(await canAccessExamWithFallback(
        user.id,
        exam.id,
        exam.creatorId,
        PERMISSIONS.ANALYTICS_VIEW,
      ))
    ) {
      return res
        .status(403)
        .json({ error: "You Don't Have Access To This Exam" });
    }

    // Fetch AI evaluation data
    const aiData = await prisma.submission.findMany({
      where: {
        examId: exam.id,
        aiEvaluation: {
          isNot: null,
        },
      },
      include: {
        aiEvaluation: true,
        user: true,
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
          },
        },
      },
    });

    return res.status(200).json(aiData);
  } catch (error) {
    console.error("Error fetching AI results:", error);
    next(error);
  }
};

export const createGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const inputSchema = z.object({
    groupName: z.string(),
    description: z.string(),
    emails: z.array(z.string().email()),
    allowJoinByLink: z.boolean(),
    isAiEnabled: z.boolean(),
    type: z.enum(["CLASS", "LAB"]),
    aiMaxMessages: z.number().min(1).max(50).optional(),
    aiMaxTokens: z.number().min(50).max(10000).optional(),
  });
  try {
    const reqBody = req.body;
    const validate = inputSchema.safeParse(reqBody);
    if (!validate.success) {
      throw new Error("Validation Failed");
    }

    const user = req.user;

    const {
      groupName,
      description,
      emails,
      allowJoinByLink,
      isAiEnabled,
      type,
      aiMaxMessages,
      aiMaxTokens,
    } = validate.data;

    const groupRedundancyCheck = await prisma.group.findFirst({
      where: {
        name: groupName,
        creatorId: user.id,
      },
    });

    if (groupRedundancyCheck?.id) {
      return res
        .status(409)
        .json({ error: "Group with same name already exists" });
    }

    const newGroup = await prisma.group.create({
      data: {
        name: groupName,
        description: description,
        creatorId: user.id,
        joinByLink: allowJoinByLink,
        type: type,
        aiEnabled: isAiEnabled,
        aiMaxMessages: aiMaxMessages ?? null,
        aiMaxTokens: aiMaxTokens ?? null,
      },
    });

    await prisma.groupMember.create({
      data: {
        groupId: newGroup.id,
        userId: user.id,
        roleId: "role_group_owner",
      },
    });

    // Filter out empty emails and trim whitespace
    const validEmails = emails
      .map((email: string) => email.trim())
      .filter((email: string) => email.length > 0);

    // Initialize all result arrays
    const notFoundMembers: string[] = [];
    const notStudents: { email: string; name: string }[] = [];
    const alreadyMembers: { email: string; name: string }[] = [];
    const successfullyAdded: { email: string; name: string }[] = [];

    // Fetch all users at once (more efficient)
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: validEmails,
        },
      },
    });

    // Create a map for quick lookup
    const userMap = new Map(users.map((user) => [user.email, user]));

    // Check which emails weren't found
    validEmails.forEach((email: string) => {
      if (!userMap.has(email)) {
        notFoundMembers.push(email);
      }
    });

    // Filter students and check for existing memberships
    const studentsToAdd = users.filter((user) => {
      if (user.role === "TEACHER") {
        notStudents.push({ email: user.email, name: user.name });
        return false;
      }
      return true;
    });

    // Check for existing group memberships
    const existingMembers = await prisma.groupMember.findMany({
      where: {
        groupId: newGroup.id,
        userId: {
          in: studentsToAdd.map((user) => user.id),
        },
      },
      include: {
        user: true,
      },
    });

    const existingMemberIds = new Set(
      existingMembers.map((member) => member.userId),
    );

    existingMembers.forEach((member) => {
      alreadyMembers.push({
        email: member.user.email,
        name: member.user.name,
      });
    });

    // Filter out students who are already members
    const newStudents = studentsToAdd.filter(
      (user) => !existingMemberIds.has(user.id),
    );

    // Batch create all group members in a single transaction
    if (newStudents.length > 0) {
      await prisma.$transaction([
        prisma.groupMember.createMany({
          data: newStudents.map((user) => ({
            groupId: newGroup.id,
            userId: user.id,
            roleId: DEFAULT_GROUP_MEMBER_ROLE_ID,
          })),
        }),
        prisma.group.update({
          where: { id: newGroup.id },
          data: {
            noOfMembers: { increment: newStudents.length },
          },
        }),
      ]);

      // Populate successfully added emails and names
      successfullyAdded.push(
        ...newStudents.map((user) => ({
          email: user.email,
          name: user.name,
        })),
      );
    }

    return res.status(200).json({
      notFoundMembers: notFoundMembers || [],
      notStudents: notStudents || [],
      alreadyMembers: alreadyMembers || [],
      addedCount: newStudents.length,
      successfullyAdded: successfullyAdded || [],
    });
  } catch (error) {
    next(error);
  }
};

export const getGroupDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const groupId = String(req.query.groupId);
    const user = req.user;

    const groupData = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!groupData) {
      throw Error("Group Not Found");
    }

    if (
      !(await canAccessGroupWithFallback(
        user.id,
        groupData.id,
        groupData.creatorId,
        PERMISSIONS.GROUP_VIEW,
      ))
    ) {
      throw Error("Not Authorized");
    }

    return res.status(200).json(groupData);
  } catch (error) {
    next(error);
  }
};

export const getGroupMembers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const groupId = String(req.query.groupId);
    const user = req.user;

    const groupData = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!groupData) {
      throw Error("Group Not Found");
    }

    if (
      !(await canAccessGroupWithFallback(
        user.id,
        groupData.id,
        groupData.creatorId,
        PERMISSIONS.GROUP_VIEW,
      ))
    ) {
      throw Error("Not Authorized");
    }

    const groupMembers = await prisma.user.findMany({
      where: {
        memberGroups: {
          some: {
            groupId: groupId,
          },
        },
      },
      
    });

    return res.status(200).json(groupMembers);
  } catch (error) {
    next(error);
  }
};

export const addMemberToGroup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { newEmails, groupId } = req.body;

    if (!newEmails || !groupId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const emails = newEmails.split(",");

    const user = req.user;

    if (!user || user.role !== "TEACHER") {
      return res.status(403).json({ error: "Not Authorized" });
    }

    const groupData = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!groupData) {
      return res.status(404).json({ error: "Group Not Found" });
    }

    if (
      !(await canAccessGroupWithFallback(
        user.id,
        groupData.id,
        groupData.creatorId,
        PERMISSIONS.GROUP_EDIT,
      ))
    ) {
      return res.status(403).json({ error: "Not Authorized" });
    }

    const emailValidator = z.array(z.string().email().min(1).max(1000));
    const validationResult = emailValidator.safeParse(emails);

    if (!validationResult.success) {
      return res.status(400).json({ error: "Email Validation Failed" });
    }

    const uniqueEmails = [...new Set(validationResult.data)];

    const studentIds: string[] = [];
    const notFoundStudents: string[] = [];

    for (const email of uniqueEmails) {
      const student = await prisma.user.findUnique({
        where: { email },
      });

      if (!student || student.role !== "STUDENT") {
        notFoundStudents.push(email);
      } else {
        studentIds.push(student.id);
      }
    }

    const result = await prisma.groupMember.createMany({
      data: studentIds.map((id) => ({
        groupId: groupData.id,
        userId: id,
        roleId: DEFAULT_GROUP_MEMBER_ROLE_ID,
      })),
    });

    await prisma.group.update({
      where: { id: groupData.id },
      data: {
        noOfMembers: { increment: result.count },
      },
    });

    return res.status(200).json({
      message: "Members added successfully",
      notFoundStudents,
    });
  } catch (error) {
    next(error);
  }
};

export const startAiEvaluation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const examId = String(req.body.examId);

    if (!examId) {
      return res.status(400).json({ error: "Exam ID is required" });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }

    if (
      !(await canAccessExamWithFallback(
        user.id,
        exam.id,
        exam.creatorId,
        PERMISSIONS.SUBMISSION_GRADE,
      ))
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to evaluate this exam" });
    }

    const now = new Date();
    if (exam.endDate > now) {
      return res.status(400).json({
        error: "Exam not ready for AI evaluation",
      });
    } else {
      await prisma.exam.update({
        where: {
          id: exam.id,
        },
        data: {
          status: "completed",
        },
      });
    }

    // 2️⃣ Get final submissions
    const submissions = await prisma.submission.findMany({
      where: {
        examId,
        isFinal: true,
        aiStatus: "PENDING",
      },
      select: { id: true },
    });

    if (submissions.length === 0) {
      return res.status(404).json({
        message: "No submissions to evaluate",
      });
    }

    const submissionIds = submissions.map((s: { id: string }) => s.id);

    // 3️⃣ Update exam status BEFORE sending
    await prisma.exam.update({
      where: { id: String(examId) },
      data: { status: "ai_processing" },
    });

    // 4️⃣ Send to SQS
    await sendBatchToSQS(submissionIds);

    return res.status(201).json({
      message: "AI evaluation started",
      total: submissionIds.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getAiEvaluationStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    const examId = String(req.query.examId);

    if (!examId) {
      return res.status(400).json({ error: "Exam ID is required" });
    }

    // Verify exam exists and user has access
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }

    if (
      !(await canAccessExamWithFallback(
        user.id,
        exam.id,
        exam.creatorId,
        PERMISSIONS.ANALYTICS_VIEW,
      ))
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this exam's status" });
    }

    const total = await prisma.submission.count({
      where: { examId, isFinal: true },
    });

    const completed = await prisma.submission.count({
      where: {
        examId,
        isFinal: true,
        aiStatus: "COMPLETED",
      },
    });

    return res.status(200).json({ total, completed });
  } catch (error) {
    next(error);
  }
};
