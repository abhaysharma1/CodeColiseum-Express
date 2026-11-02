import { describe, expect, it } from "vitest";
import { resolvePagination } from "@/shared/http/pagination";

describe("resolvePagination", () => {
  it("supports page/limit", () => {
    expect(resolvePagination({ page: "3", limit: "10" })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
    });
  });

  it("supports the legacy take/skip convention", () => {
    expect(resolvePagination({ take: "5", skip: "10" })).toEqual({
      page: 3,
      limit: 5,
      skip: 10,
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(
      resolvePagination({ page: "-1", limit: "not-a-number" }),
    ).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it("caps the limit", () => {
    expect(resolvePagination({ limit: "5000" }, { maxLimit: 100 }).limit).toBe(
      100,
    );
  });
});
