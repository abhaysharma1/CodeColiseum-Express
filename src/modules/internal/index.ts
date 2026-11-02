export { default as internalRouter } from "./internal.routes";
export {
  calculateAttemptScore,
  finalizeExpiredExams,
  recomputeAnalytics,
} from "./internal.service";
export type {
  AttemptScoreInput,
  FinalizeExamsResult,
  RecomputeAnalyticsResult,
} from "./internal.service";
