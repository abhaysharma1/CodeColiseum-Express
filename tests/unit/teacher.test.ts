import { describe, expect, it } from "vitest";
import {
  calculatePassingPercentage,
  deriveExamStatus,
} from "@/modules/teacher/teacher.rules";

const now = new Date("2026-01-15T12:00:00.000Z");
const hour = 60 * 60 * 1000;

describe("deriveExamStatus", () => {
  it("returns DRAFT when the exam is not published", () => {
    expect(
      deriveExamStatus(
        false,
        new Date(now.getTime() - hour),
        new Date(now.getTime() + hour),
        now,
      ),
    ).toBe("DRAFT");
  });

  it("returns SCHEDULED when a published exam starts in the future", () => {
    expect(
      deriveExamStatus(
        true,
        new Date(now.getTime() + hour),
        new Date(now.getTime() + 2 * hour),
        now,
      ),
    ).toBe("SCHEDULED");
  });

  it("returns ACTIVE while the exam window includes now", () => {
    expect(
      deriveExamStatus(
        true,
        new Date(now.getTime() - hour),
        new Date(now.getTime() + hour),
        now,
      ),
    ).toBe("ACTIVE");
  });

  it("treats the exact end date as still active", () => {
    expect(
      deriveExamStatus(true, new Date(now.getTime() - hour), now, now),
    ).toBe("ACTIVE");
  });

  it("returns COMPLETED after the end date", () => {
    expect(
      deriveExamStatus(
        true,
        new Date(now.getTime() - 2 * hour),
        new Date(now.getTime() - hour),
        now,
      ),
    ).toBe("COMPLETED");
  });
});

describe("calculatePassingPercentage", () => {
  it("rounds to two decimals", () => {
    expect(calculatePassingPercentage(1, 3)).toBe(33.33);
    expect(calculatePassingPercentage(2, 3)).toBe(66.67);
  });

  it("returns zero when there are no attempts", () => {
    expect(calculatePassingPercentage(0, 0)).toBe(0);
    expect(calculatePassingPercentage(5, 0)).toBe(0);
  });
});
