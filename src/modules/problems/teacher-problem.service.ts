import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import { runRawCodeService } from "@/services/runReferenceSolution.service";
import * as teacherProblemRepository from "./teacher-problem.repository";
import type {
  CreateTeacherProblemInput,
  MyProblemsQuery,
  ProblemTestCase,
  RunReferenceSolutionInput,
  UpdateTeacherProblemInput,
} from "./teacher-problem.schema";

export async function createProblem(
  ownerId: string,
  input: CreateTeacherProblemInput,
) {
  const nextNumber =
    (await teacherProblemRepository.findMaxProblemNumber()) + 1;

  const problem = await teacherProblemRepository.createProblemAggregate({
    title: input.title,
    description: (input.description ?? "").trim(),
    difficulty: input.difficulty,
    number: nextNumber,
    ownerId,
    tags: input.tags,
    publicCases: input.testCases.public,
    hiddenCases: input.testCases.hidden,
    driverCode: input.driverCode,
    solutions: input.solutions,
  });

  return {
    id: problem.id,
    message:
      input.status === "SUBMIT"
        ? "Problem submitted for approval successfully"
        : "Draft saved successfully",
  };
}

export async function listMyProblems(
  ownerId: string,
  query: MyProblemsQuery,
) {
  const { problems, total } =
    await teacherProblemRepository.findProblemsByOwner({
      ownerId,
      searchValue: query.searchValue,
      difficulty: query.difficulty,
      approvalStatus: query.approvalStatus,
      take: query.take,
      skip: query.skip,
    });

  return {
    problems,
    pagination: {
      take: query.take,
      skip: query.skip,
      total,
    },
  };
}

async function requireOwnedProblem(
  ownerId: string,
  problemId: string,
  message: string,
) {
  const problem = await teacherProblemRepository.findProblemOwnership(
    problemId,
  );

  if (!problem) {
    throw new NotFoundError("Problem not found");
  }

  if (problem.ownerId !== ownerId) {
    throw new ForbiddenError(message);
  }

  return problem;
}

export async function getProblemForEditor(
  ownerId: string,
  problemId: string,
) {
  const problem = await teacherProblemRepository.findProblemForEditor(
    problemId,
  );

  if (!problem) {
    throw new NotFoundError("Problem not found");
  }

  if (problem.ownerId !== ownerId) {
    throw new ForbiddenError("You can only view your own problems");
  }

  const driverCode: Record<
    string,
    { header: string; template: string; footer: string }
  > = {};

  problem.driverCode.forEach((entry) => {
    driverCode[entry.language.toLowerCase()] = {
      header: entry.header ?? "",
      template: entry.template ?? "",
      footer: entry.footer ?? "",
    };
  });

  const publicTests = problem.runTestCase?.cases
    ? (problem.runTestCase.cases as unknown as ProblemTestCase[])
    : [];
  const hiddenTests = problem.testCase?.cases
    ? (problem.testCase.cases as unknown as ProblemTestCase[])
    : [];

  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    hidden: problem.hidden,
    tags: problem.tags.map((problemTag) => problemTag.tag.name),
    description: problem.description ?? "",
    testCases: {
      public: publicTests.map((testCase, index) => ({
        id: testCase.id || `pub-${index}`,
        input: testCase.input,
        output: testCase.output,
      })),
      hidden: hiddenTests.map((testCase, index) => ({
        id: testCase.id || `hid-${index}`,
        input: testCase.input,
        output: testCase.output,
      })),
    },
    driverCode,
    solutions: problem.referenceSolutions.map((solution) => ({
      id: solution.id,
      language: solution.language,
      code: solution.code,
    })),
    approvalStatus: problem.approvalStatus,
    rejectionReason: problem.rejectionReason,
    performanceConstraints: problem.performanceConstraints || null,
    performanceTestCases: problem.performanceTestCases || [],
  };
}

export async function updateProblem(
  ownerId: string,
  problemId: string,
  input: UpdateTeacherProblemInput,
) {
  await requireOwnedProblem(
    ownerId,
    problemId,
    "You can only edit your own problems",
  );

  const isSubmit = input.status === "SUBMIT";
  const fields = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined
      ? { description: input.description.trim() }
      : {}),
    ...(input.difficulty !== undefined
      ? { difficulty: input.difficulty }
      : {}),
    ...(isSubmit
      ? {
          approvalStatus: "PENDING" as const,
          approvedAt: null,
          approvedById: null,
          rejectionReason: null,
        }
      : {}),
  };

  await teacherProblemRepository.updateProblemAggregate({
    problemId,
    fields,
    tags: input.tags,
    testCases: input.testCases,
    driverCode: input.driverCode,
    solutions: input.solutions,
  });

  return {
    message: isSubmit
      ? "Problem submitted for approval successfully"
      : "Draft updated successfully",
  };
}

export async function deleteProblem(
  ownerId: string,
  problemId: string,
) {
  await requireOwnedProblem(
    ownerId,
    problemId,
    "You can only delete your own problems",
  );

  const usage = await teacherProblemRepository.findProblemUsage(problemId);

  if (usage.usedInExam || usage.usedInModule) {
    throw new ConflictError(
      "Cannot delete a problem that is already used in exams or modules",
    );
  }

  await teacherProblemRepository.deleteProblem(problemId);

  return { message: "Problem deleted" };
}

export async function resubmitProblem(
  ownerId: string,
  problemId: string,
) {
  const problem = await requireOwnedProblem(
    ownerId,
    problemId,
    "You can only resubmit your own problems",
  );

  if (problem.approvalStatus !== "REJECTED") {
    throw new ValidationError("Only rejected problems can be resubmitted");
  }

  await teacherProblemRepository.updateProblemApprovalStatus(
    problemId,
    "PENDING",
  );

  return { message: "Problem resubmitted for approval" };
}

export async function runReferenceSolution(
  input: RunReferenceSolutionInput,
) {
  return runRawCodeService(input);
}
