import { describe, expect, it } from "vitest";
import {
  clearPermissionCacheForUser,
  getPermissionLookupKeys,
} from "@/modules/permissions/permission.service";
import { PERMISSIONS } from "@/permissions/permission.constants";

describe("permission lookup keys", () => {
  it("returns the canonical key and its aliases", () => {
    const keys = getPermissionLookupKeys(PERMISSIONS.EXAM_CREATE);

    expect(keys[0]).toBe(PERMISSIONS.EXAM_CREATE);
    expect(keys).toContain("CREATE_EXAM");
  });

  it("normalizes alias input to the canonical key", () => {
    const keys = getPermissionLookupKeys("CREATE_EXAM");

    expect(keys[0]).toBe(PERMISSIONS.EXAM_CREATE);
  });

  it("normalizes case and whitespace", () => {
    expect(getPermissionLookupKeys("  GROUP:VIEW  ")[0]).toBe("group:view");
  });

  it("returns unknown permissions unchanged", () => {
    expect(getPermissionLookupKeys("custom:permission")).toEqual([
      "custom:permission",
    ]);
  });

  it("keeps cache invalidation no-op for the in-memory provider", async () => {
    await expect(clearPermissionCacheForUser("user-1")).resolves.toBeUndefined();
  });
});
