export interface NormalCaseResult {
  testcaseId: string;
  status: 'ACCEPTED' | 'WRONG_ANSWER' | 'RUNTIME_ERROR';
}

export interface NormalCasesResult {
  totalRuntimeMs: number;
  totalMemoryKb: number;
  passedCount: number;
  totalCount: number;
  compilationError?: string;
  cases: NormalCaseResult[];
}

export interface PerformanceCaseResult {
  id: string;
  name: string;
  runtimeMs: number;
  memoryKb: number;
  inputBytes: number;
  status: 'ACCEPTED' | 'WRONG_ANSWER' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED';
}

export interface RuntimeAnalysisSummary {
  fastestRuntimeMs: number;
  slowestRuntimeMs: number;
  averageRuntimeMs: number;
  maxMemoryKb: number;
  averageMemoryKb: number;
}

export interface RuntimeAnalysisResult {
  normalCases: NormalCasesResult | null;
  performanceCases: PerformanceCaseResult[];
  summary: RuntimeAnalysisSummary | null;
  compilationError?: string;
}
