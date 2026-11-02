import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/exam.utils", () => ({
  verifySEB: vi.fn(),
}));

vi.mock("@/modules/marketplace/marketplace.service", () => ({
  publishLab: vi.fn(),
  unpublishLab: vi.fn(),
  getLabAnalytics: vi.fn(),
}));

vi.mock("@/modules/labs/lab.repository", () => ({
  findTeacherReadableLab: vi.fn(),
  findLabById: vi.fn(),
  findTeacherReadableModule: vi.fn(),
  findTeacherWritableModule: vi.fn(),
  findTeacherReadableModuleProblem: vi.fn(),
  findTeacherWritableModuleProblem: vi.fn(),
  findStudentGroupIds: vi.fn(),
  findLabIdsForGroups: vi.fn(),
  findLabWithModulesForStudent: vi.fn(),
  findModuleBrief: vi.fn(),
  findModuleProblemWithModule: vi.fn(),
}));

import * as labRepository from "@/modules/labs/lab.repository";
import {
  canAccessModuleProblem,
  getStudentLabIds,
  getStudentModuleProblem,
  getStudentModuleProgress,
  getStudentMyLab,
  getTeacherLabForWrite,
  getTeacherLabOrThrow,
} from "@/modules/labs/lab.service";
import { ForbiddenError, NotFoundError } from "@/shared/errors";

const repository = vi.mocked(labRepository);

describe("teacher lab access", () => {
  beforeEach(() => {
    repository.findTeacherReadableLab.mockReset();
    repository.findLabById.mockReset();
  });

  it("rejects a lab that does not exist", async () => {
    repository.findTeacherReadableLab.mockResolvedValue(null);

    await expect(getTeacherLabOrThrow("teacher-1", "lab-1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects a teacher who is neither the creator nor assigned", async () => {
    repository.findTeacherReadableLab.mockResolvedValue({
      creatorId: "teacher-2",
      teachers: [],
    } as never);

    await expect(getTeacherLabOrThrow("teacher-1", "lab-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("allows an assigned co-teacher to read the lab", async () => {
    repository.findTeacherReadableLab.mockResolvedValue({
      creatorId: "teacher-2",
      teachers: [{ id: "lab-teacher-1" }],
    } as never);

    await expect(getTeacherLabOrThrow("teacher-1", "lab-1")).resolves.toEqual(
      expect.objectContaining({ creatorId: "teacher-2" }),
    );
  });

  it("does not let an assigned co-teacher write to the lab", async () => {
    repository.findLabById.mockResolvedValue({ creatorId: "teacher-2" } as never);

    await expect(getTeacherLabForWrite("teacher-1", "lab-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("student lab access", () => {
  beforeEach(() => {
    repository.findStudentGroupIds.mockReset();
    repository.findLabIdsForGroups.mockReset();
    repository.findLabWithModulesForStudent.mockReset();
    repository.findModuleBrief.mockReset();
    repository.findModuleProblemWithModule.mockReset();
  });

  it("returns no labs when the student has no groups", async () => {
    repository.findStudentGroupIds.mockResolvedValue([]);

    await expect(getStudentLabIds("student-1")).resolves.toEqual([]);
    expect(repository.findLabIdsForGroups).not.toHaveBeenCalled();
  });

  it("derives labs from the student's group assignments", async () => {
    repository.findStudentGroupIds.mockResolvedValue(["group-1"]);
    repository.findLabIdsForGroups.mockResolvedValue(["lab-1", "lab-2"]);

    await expect(getStudentLabIds("student-1")).resolves.toEqual([
      "lab-1",
      "lab-2",
    ]);
  });

  it("rejects a lab the student is not enrolled in", async () => {
    repository.findStudentGroupIds.mockResolvedValue(["group-1"]);
    repository.findLabIdsForGroups.mockResolvedValue(["lab-1"]);

    await expect(getStudentMyLab("student-1", "lab-2")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(repository.findLabWithModulesForStudent).not.toHaveBeenCalled();
  });

  it("rejects module progress for a module outside the student's labs", async () => {
    repository.findStudentGroupIds.mockResolvedValue(["group-1"]);
    repository.findLabIdsForGroups.mockResolvedValue(["lab-1"]);
    repository.findModuleBrief.mockResolvedValue({ labId: "lab-2" } as never);

    await expect(
      getStudentModuleProgress("student-1", "module-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a module problem belonging to another lab", async () => {
    repository.findStudentGroupIds.mockResolvedValue(["group-1"]);
    repository.findLabIdsForGroups.mockResolvedValue(["lab-1"]);
    repository.findModuleProblemWithModule.mockResolvedValue({
      id: "module-problem-1",
      module: {
        id: "module-1",
        lab: { id: "lab-2" },
        unlockAt: null,
      },
    } as never);

    await expect(
      getStudentModuleProblem("student-1", "module-problem-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a module problem from a locked module", async () => {
    repository.findStudentGroupIds.mockResolvedValue(["group-1"]);
    repository.findLabIdsForGroups.mockResolvedValue(["lab-1"]);
    repository.findModuleProblemWithModule.mockResolvedValue({
      id: "module-problem-1",
      module: {
        id: "module-1",
        lab: { id: "lab-1" },
        unlockAt: new Date(Date.now() + 60_000),
      },
    } as never);

    await expect(
      getStudentModuleProblem("student-1", "module-problem-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("module problem access windows", () => {
  it("blocks locked problems", () => {
    expect(
      canAccessModuleProblem({
        isUnlocked: false,
        availableFrom: null,
        availableUntil: null,
      }),
    ).toEqual({ allowed: false, reason: "LOCKED" });
  });

  it("blocks problems scheduled for the future", () => {
    expect(
      canAccessModuleProblem({
        isUnlocked: true,
        availableFrom: new Date(Date.now() + 60_000),
        availableUntil: null,
      }),
    ).toEqual({ allowed: false, reason: "NOT_YET_AVAILABLE" });
  });

  it("blocks expired problems", () => {
    expect(
      canAccessModuleProblem({
        isUnlocked: true,
        availableFrom: null,
        availableUntil: new Date(Date.now() - 60_000),
      }),
    ).toEqual({ allowed: false, reason: "EXPIRED" });
  });

  it("allows unlocked problems inside their availability window", () => {
    expect(
      canAccessModuleProblem({
        isUnlocked: true,
        availableFrom: new Date(Date.now() - 60_000),
        availableUntil: new Date(Date.now() + 60_000),
      }),
    ).toEqual({ allowed: true });
  });
});
