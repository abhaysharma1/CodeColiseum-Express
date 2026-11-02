import { describe, expect, it } from "vitest";
import { normalizeProblemTestCases } from "@/shared/utils/problem-test-cases";

describe("normalizeProblemTestCases", () => {
  it("returns an empty list for malformed JSON", () => {
    expect(normalizeProblemTestCases("{not-json")).toEqual([]);
  });

  it("normalizes a single object", () => {
    expect(normalizeProblemTestCases({ input: "1 2", output: "3" })).toEqual([
      { input: "1 2", output: "3" },
    ]);
  });

  it("splits delimited output bundles", () => {
    const result = normalizeProblemTestCases({
      input: "_CASE_START_\n1\n_CASE_END_\n_CASE_START_\n2\n_CASE_END_",
      output:
        "_CASE_START_\n10\n_CASE_END_\n_CASE_START_\n20\n_CASE_END_",
    });

    expect(result).toEqual([
      { input: "1", output: "10" },
      { input: "2", output: "20" },
    ]);
  });

  it("splits bundled inputs by the declared count", () => {
    const result = normalizeProblemTestCases({
      input: "2\n1\n2",
      output:
        "_CASE_START_\n1\n_CASE_END_\n_CASE_START_\n2\n_CASE_END_",
    });

    expect(result).toEqual([
      { input: "1", output: "1" },
      { input: "2", output: "2" },
    ]);
  });

  it("drops empty test cases", () => {
    expect(normalizeProblemTestCases([{ input: "", output: "" }])).toEqual([]);
  });
});
