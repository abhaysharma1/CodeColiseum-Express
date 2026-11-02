import { describe, expect, it } from "vitest";
import adminRouter from "@/modules/admin/admin.routes";

interface RegisteredRoute {
  path: string;
  methods: string[];
}

/**
 * Guards the admin API surface during the modular extraction: every endpoint
 * that the legacy `routes/admin.route.ts` exposed must stay reachable at the
 * same path and verb.
 */
function registeredRoutes(): RegisteredRoute[] {
  const stack = (adminRouter as unknown as {
    stack: { route?: { path: string; methods: Record<string, boolean> } }[];
  }).stack;

  return stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route!.path,
      methods: Object.keys(layer.route!.methods),
    }));
}

describe("admin router surface", () => {
  it("keeps every legacy admin endpoint", () => {
    expect(registeredRoutes()).toEqual(
      expect.arrayContaining([
        { path: "/driver-code", methods: ["post"] },
        { path: "/performance-constraints", methods: ["get"] },
        { path: "/performance-constraints", methods: ["post"] },
        { path: "/performance-constraints", methods: ["delete"] },
        { path: "/performance-test-cases", methods: ["get"] },
        { path: "/performance-test-cases", methods: ["post"] },
        { path: "/performance-test-cases/:id", methods: ["delete"] },
        { path: "/upload-problems", methods: ["post"] },
        { path: "/problems", methods: ["get"] },
        { path: "/problems", methods: ["post"] },
        { path: "/problems/:id", methods: ["get"] },
        { path: "/problems/:id", methods: ["put"] },
        { path: "/problems/run-reference-solution", methods: ["post"] },
        { path: "/problems/:problemId/runtime-analyzer", methods: ["post"] },
        { path: "/problems/:id/hidden", methods: ["patch"] },
        { path: "/problems/:id/publish", methods: ["patch"] },
        { path: "/validate-complexity-cases", methods: ["post"] },
        { path: "/validate-problem", methods: ["post"] },
        { path: "/bulkSignup", methods: ["post"] },
        { path: "/colleges", methods: ["get"] },
        { path: "/colleges", methods: ["post"] },
        { path: "/bulk-student-signup", methods: ["post"] },
        { path: "/bulk-teacher-signup", methods: ["post"] },
        { path: "/bulk-signup/upload-csv", methods: ["post"] },
        { path: "/single-signup", methods: ["post"] },
        { path: "/assign-role", methods: ["patch"] },
        { path: "/reset-password-by-email", methods: ["post"] },
        { path: "/send-credentials-email", methods: ["post"] },
      ]),
    );
  });

  it("mounts the moderation and analytics sub-routers", () => {
    const stack = (adminRouter as unknown as {
      stack: { route?: unknown; handle?: { stack?: unknown } }[];
    }).stack;

    const mountedRouters = stack.filter(
      (layer) => !layer.route && Array.isArray(layer.handle?.stack),
    );

    // `isAdmin` is middleware; the two mounted Routers are moderation and
    // organization analytics.
    expect(mountedRouters).toHaveLength(2);
  });
});
