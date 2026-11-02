/**
 * Teacher domain entry point.
 *
 * Exam builder/management and group management are fully layered inside this
 * module. The analytics and problem sub-routers are mounted by
 * `teacher.routes.ts`; lab management is re-exported from the labs module.
 */
export { default as teacherRouter } from "./teacher.routes";
export { default as labTeacherRouter } from "@/modules/labs/lab.teacher.routes";
