import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/problems/teacher-problem.repository", () => ({
  findProblemOwnership: vi.fn(),
  findProblemForEditor: vi.fn(),
  findProblemUsage: vi.fn(),
  deleteProblem: vi.fn(),
  updateProblemApprovalStatus: vi.fn(),
  updateProblemAggregate: vi.fn(),
  findProblemsByOwner: vi.fn(),
}));

import * as repositoryModule from "@/modules/problems/teacher-problem.repository";
import {
  deleteProblem,
  getProblemForEditor,
  listMyProblems,
  resubmitProblem,
  updateProblem,
} from "@/modules/problems/teacher-problem.service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";

const repository = vi.mocked(repositoryModule);

describe("teacher problem ownership", () => {
  beforeEach(() => {
    repository.findProblemOwnership.mockReset();
    repository.findProblemForEditor.mockReset();
    repository.findProblemUsage.mockReset();
    repository.deleteProblem.mockReset();
    repository.updateProblemAggregate.mockReset();
    repository.updateProblemApprovalStatus.mockReset();
  });

  it("rejects editing another teacher's problem", async () => {
    repository.findProblemOwnership.mockResolvedValue({
      id: "problem-1",
      ownerId: "teacher-2",
      approvalStatus: "PENDING",
    });

    await expect(
      updateProblem("teacher-1", "problem-1", { title: "Updated" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(repository.updateProblemAggregate).not.toHaveBeenCalled();
  });

  it("returns not found for a missing problem", async () => {
    repository.findProblemOwnership.mockResolvedValue(null);

    await expect(
      deleteProblem("teacher-1", "problem-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("blocks deletion when the problem is used in an exam", async () => {
    repository.findProblemOwnership.mockResolvedValue({
      id: "problem-1",
      ownerId: "teacher-1",
      approvalStatus: "APPROVED",
    });
    repository.findProblemUsage.mockResolvedValue({
      usedInExam: true,
      usedInModule: false,
    });

    await expect(
      deleteProblem("teacher-1", "problem-1"),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(repository.deleteProblem).not.toHaveBeenCalled();
  });

  it("only resubmits rejected problems", async () => {
    repository.findProblemOwnership.mockResolvedValue({
      id: "problem-1",
      ownerId: "teacher-1",
      approvalStatus: "APPROVED",
    });

    await expect(
      resubmitProblem("teacher-1", "problem-1"),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(repository.updateProblemApprovalStatus).not.toHaveBeenCalled();
  });

  it("resubmits a rejected problem", async () => {
    repository.findProblemOwnership.mockResolvedValue({
      id: "problem-1",
      ownerId: "teacher-1",
      approvalStatus: "REJECTED",
    });
    repository.updateProblemApprovalStatus.mockResolvedValue(undefined);

    await expect(
      resubmitProblem("teacher-1", "problem-1"),
    ).resolves.toEqual({ message: "Problem resubmitted for approval" });

    expect(repository.updateProblemApprovalStatus).toHaveBeenCalledWith(
      "problem-1",
      "PENDING",
    );
  });

  it("forbids viewing another teacher's problem editor payload", async () => {
    repository.findProblemForEditor.mockResolvedValue({
      ownerId: "teacher-2",
    } as never);

    await expect(
      getProblemForEditor("teacher-1", "problem-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("teacher problem listing", () => {
  it("returns the legacy pagination shape", async () => {
    vi.mocked(repositoryModule.findProblemsByOwner).mockResolvedValue({
      problems: [],
      total: 0,
    });

    await expect(
      listMyProblems("teacher-1", { take: 10, skip: 20 }),
    ).resolves.toEqual({
      problems: [],
      pagination: { take: 10, skip: 20, total: 0 },
    });
  });
});
