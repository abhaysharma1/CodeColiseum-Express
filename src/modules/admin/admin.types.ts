/**
 * Transport-agnostic shapes used by the admin domain. The judge-like payloads
 * mirror what the problem editor expects from the code execution service.
 */
export interface JudgeStatus {
  id: number;
  description: string;
}

export interface JudgeResponse {
  stdout: string | null;
  time: string;
  memory: number;
  stderr: string | null;
  token: string;
  compile_output: string | null;
  message: string | null;
  status: JudgeStatus;
  stdin?: string | null;
  expected_output?: string | null;
}

export interface BulkProblemResult {
  title: string;
  result: "created" | "error";
  number?: number;
  message?: string;
}

export interface BulkSignupResultRow {
  email: string;
  name: string;
  password: string;
  result: "created" | "error";
  message?: string;
}

export interface CredentialsEmailResultRow {
  email: string;
  name: string;
  result: "sent" | "error";
  message?: string;
}

export interface ComplexityValidationOutcome {
  passed: boolean;
  expectedComplexity: string;
  yourComplexity: string;
  ratio: number;
}
