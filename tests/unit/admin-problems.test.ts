import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/admin/admin.repository", () => ({
  findProblemById: vi.fn(),
  findPerformanceConstraints: vi.fn(),
  findCollegeById: vi.fn(),
  upsertTagNames: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  auth: { api: { signUpEmail: vi.fn() } },
}));

import * as repositoryModule from "@/modules/admin/admin.repository";
import {
  bulkStudentSignUp,
  removePerformanceConstraints,
  saveProblem,
  setProblemHidden,
} from "@/modules/admin/admin.service";
import { NotFoundError, ValidationError } from "@/shared/errors";

const repository = vi.mocked(repositoryModule);

const editorInput = {
  title: "Two Sum",
  difficulty: "EASY" as const,
  tags: [],
  description: "",
  testCases: { public: [], hidden: [] },
  driverCode: {},
  solutions: [],
  status: "PUBLISHED" as const,
  hidden: false,
};

describe("admin problem service", () => {
  beforeEach(() => {
    repository.findProblemById.mockReset();
    repository.findPerformanceConstraints.mockReset();
    repository.findCollegeById.mockReset();
    repository.upsertTagNames.mockReset();
  });

  it("refuses to publish without a reference solution", async () => {
    await expect(
      saveProblem("admin-1", undefined, editorInput),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(repository.upsertTagNames).not.toHaveBeenCalled();
  });

  it("returns not found when hiding a missing problem", async () => {
    repository.findProblemById.mockResolvedValue(null);

    await expect(setProblemHidden("problem-1", true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("returns not found when deleting missing performance constraints", async () => {
    repository.findPerformanceConstraints.mockResolvedValue(null);

    await expect(
      removePerformanceConstraints("problem-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("admin bulk signup service", () => {
  beforeEach(() => {
    repository.findCollegeById.mockReset();
  });

  it("requires a college selection", async () => {
    await expect(
      bulkStudentSignUp({ fileBuffer: Buffer.from(""), meta: {} }),
    ).rejects.toThrow("College selection is required");
  });

  it("rejects an unknown college", async () => {
    repository.findCollegeById.mockResolvedValue(null);

    await expect(
      bulkStudentSignUp({
        fileBuffer: Buffer.from(""),
        meta: { collegeId: "missing" },
      }),
    ).rejects.toThrow("Selected college not found");
  });
});
