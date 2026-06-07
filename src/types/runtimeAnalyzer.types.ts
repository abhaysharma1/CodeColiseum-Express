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

export interface StressCaseResult {
  size: number;
  runtimeMs: number;
  memoryKb: number;
  inputBytes: number;
  generatorType: string;
  pattern: string;
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
  stressCases: StressCaseResult[];
  summary: RuntimeAnalysisSummary | null;
  compilationError?: string;
}
