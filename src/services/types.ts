export interface ExecutionFailureContext {
  status: "COMPILE_ERROR" | "INTERNAL_ERROR";
  stderr?: string;
}

export interface ExecuteCodeRequest {
  language: string;
  version?: string;
  files: Array<{ name?: string; content: string }>;
  stdin?: string;
  run_timeout?: number;
  compile_timeout?: number;
}

export interface ExecuteCodeResponse {
  stdout: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: string | null;
  timeMs: number;
  memoryKb: number;
}

export interface ExecuteCodeBatchRequest {
  language: string;
  version?: string;
  files: Array<{ name?: string; content: string }>;
  test_cases: Array<{ stdin: string; args?: string[] }>;
  stop_on_first_failure?: boolean;
  compile_timeout?: number;
  run_timeout?: number;
  aggregate_run_timeout?: number;
}

export interface NormalizedTestcase {
  testcaseId: string;
  input: string;
  expectedOutput: string;
}

export interface ExecutionResult {
  passedCount: number;
  totalTestcases: number;
  executionTimeMs: number;
  memoryKb: number;
  failedCaseIndex: number | null;
  details: Array<{
    testcaseId: string;
    passed: boolean;
    stdout: string;
    expectedOutput: string;
    stderr?: string;
    timeMs: number;
    memoryKb: number;
  }>;
}

export type PerformanceTestStatus =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "BAD_SCALING";

export interface PerformanceTestResult {
  status: PerformanceTestStatus;
  executionTimeMs: number;
  memoryKb: number;
  failedCaseName?: string;
  passedCount: number;
  totalTestcases: number;
}
