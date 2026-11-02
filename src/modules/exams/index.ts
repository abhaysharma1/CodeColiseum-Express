export { default as examsRouter } from "./exam.routes";
export {
  calculateSubmittedExamScore,
  getExamDetails,
  getSubmissions,
  submitTest,
} from "./exam.service";
export type { ExamSubmissionScoreInput } from "./exam.service";
