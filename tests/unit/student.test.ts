import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/student/student.repository", () => ({
  findGroupById: vi.fn(),
  findGroupMembership: vi.fn(),
  findUserById: vi.fn(),
  findExamForResult: vi.fn(),
}));

import * as studentRepository from "@/modules/student/student.repository";
import {
  getExamResult,
  getGroupCreator,
  getGroupData,
} from "@/modules/student/student.service";
import { ForbiddenError, NotFoundError } from "@/shared/errors";

const repository = vi.mocked(studentRepository);

const group = {
  id: "group-1",
  creatorId: "teacher-1",
};

describe("student group access control", () => {
  beforeEach(() => {
    repository.findGroupById.mockReset();
    repository.findGroupMembership.mockReset();
    repository.findUserById.mockReset();
  });

  it("rejects a group that does not exist", async () => {
    repository.findGroupById.mockResolvedValue(null);

    await expect(getGroupData("student-1", "group-1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects a student who is not a member", async () => {
    repository.findGroupById.mockResolvedValue(group as never);
    repository.findGroupMembership.mockResolvedValue(null);

    await expect(getGroupData("student-1", "group-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns the group for a member", async () => {
    repository.findGroupById.mockResolvedValue(group as never);
    repository.findGroupMembership.mockResolvedValue({ id: "membership-1" } as never);

    await expect(getGroupData("student-1", "group-1")).resolves.toBe(group);
  });

  it("returns the creator for a member", async () => {
    repository.findGroupById.mockResolvedValue(group as never);
    repository.findGroupMembership.mockResolvedValue({ id: "membership-1" } as never);
    repository.findUserById.mockResolvedValue({
      id: "teacher-1",
      name: "Teacher",
    } as never);

    await expect(getGroupCreator("student-1", "group-1")).resolves.toEqual({
      id: "teacher-1",
      name: "Teacher",
    });
  });

  it("does not load group details for another student's result", async () => {
    await expect(
      getExamResult("student-1", "exam-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
