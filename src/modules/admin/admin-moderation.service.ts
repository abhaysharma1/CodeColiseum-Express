import { NotFoundError, ValidationError } from "@/shared/errors";
import * as moderationRepository from "./admin-moderation.repository";
import type {
  ModerationListQuery,
  RejectProblemInput,
} from "./admin-moderation.schema";

type ModerationStatus = "PENDING" | "REJECTED" | "APPROVED";

const ONLY_TEACHER_PROBLEMS =
  "Only teacher-created problems can be moderated";

async function requireTeacherProblem(problemId: string): Promise<void> {
  const problem = await moderationRepository.findProblemModerationState(
    problemId,
  );

  if (!problem) {
    throw new NotFoundError("Problem not found");
  }

  if (problem.ownerType !== "TEACHER") {
    throw new ValidationError(ONLY_TEACHER_PROBLEMS);
  }
}

export async function listModerationProblems(
  approvalStatus: ModerationStatus,
  query: ModerationListQuery,
) {
  const { problems, total } =
    await moderationRepository.findProblemsForModeration({
      approvalStatus,
      searchValue: query.searchValue,
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

export async function approveProblem(problemId: string, adminId: string) {
  await requireTeacherProblem(problemId);
  await moderationRepository.approveProblem(problemId, adminId);

  return { message: "Problem approved successfully" };
}

export async function rejectProblem(
  problemId: string,
  input: RejectProblemInput,
) {
  await requireTeacherProblem(problemId);
  await moderationRepository.rejectProblem(problemId, input.reason);

  return { message: "Problem rejected" };
}
