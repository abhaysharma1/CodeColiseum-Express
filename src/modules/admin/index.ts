/**
 * Admin domain entry point.
 *
 * Problem moderation, problem authoring/import, performance tooling and
 * organization account administration are layered modules now. The legacy
 * controller has been fully extracted into this directory.
 */
export { default as adminRouter } from "./admin.routes";
export { default as adminModerationRouter } from "./admin-moderation.routes";
