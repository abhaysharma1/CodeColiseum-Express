/**
 * Pure teacher-domain rules.
 *
 * Kept free of Prisma/Express imports so they can be unit tested directly and
 * reused by both the exam and group services.
 */

export type DerivedExamStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "COMPLETED";

export const EXAM_PASSING_SCORE = 60;

/**
 * Status shown in the teacher UI. Derived from publish state + schedule instead
 * of the persisted `ExamStatus` column (legacy behaviour).
 */
export function deriveExamStatus(
  isPublished: boolean,
  startDate: Date,
  endDate: Date,
  now: Date,
): DerivedExamStatus {
  if (!isPublished) return "DRAFT";
  if (startDate > now) return "SCHEDULED";
  if (endDate >= now) return "ACTIVE";
  return "COMPLETED";
}

/** Rounded to two decimals, matching the legacy listing payload. */
export function calculatePassingPercentage(
  passing: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return Math.round((passing / total) * 10000) / 100;
}
