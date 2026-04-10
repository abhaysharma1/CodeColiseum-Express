import { ExecutionStatus } from "../../generated/prisma/enums";

/**
 * Response sent while submission is being processed (polling phase)
 * Minimal payload to reduce network traffic during active polling
 */
export interface PollResponse {
  success: boolean;
  submissionId: string;
  status: ExecutionStatus;
}

/**
 * Response sent when submission processing is complete (terminal state)
 * Complete payload with all execution details for final display
 */
export interface TerminalResponse {
  success: boolean;
  submissionId: string;
  status: ExecutionStatus;
  sourceCode: string;
  language: string;
  passedTestcases: number;
  totalTestcases: number;
  executionTime?: number; // in seconds
  memory?: number; // in MB
  stderr?: string | null;
  createdAt: Date;
}

/**
 * Discriminated union of polling and terminal responses
 * Type guard: check if 'sourceCode' exists to narrow to TerminalResponse
 */
export type SubmissionStatusResponse = PollResponse | TerminalResponse;
