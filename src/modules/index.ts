/**
 * Module registry — the single place that composes the API surface.
 *
 * Migrated modules expose fully layered routes. Domains that have not been
 * extracted yet expose their frozen routers through a module entry point so
 * `app.ts` never imports route internals directly.
 */
export { authRouter } from "./auth";
export { problemsRouter } from "./problems";
export { notificationsRouter } from "./notifications";
export { permissionsRouter } from "./permissions";
export { marketplaceRouter } from "./marketplace";
export { formatterRouter } from "./formatter";
export { healthRouter, sebRouter } from "./system";
export { teacherRouter, labTeacherRouter } from "./teacher";
export { studentRouter, labStudentRouter } from "./student";
export { adminRouter } from "./admin";
export { internalRouter } from "./internal";
