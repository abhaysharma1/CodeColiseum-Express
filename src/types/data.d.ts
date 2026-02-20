export type ExamResultResponse = {
  examDetails: {
    id: string;
    examStatus: string;
    title: string;
    description: string | null;
    durationMin: number;
    startDate: Date;
    endDate: Date;
    creator: {
      id: string;
      name: string;
      email: string;
    };
    problems: Array<{
      order: number;
      problem: {
        id: string;
        number: number;
        title: string;
        difficulty: string;
      };
    }>;
  };
  examAttempt: {
    id: string;
    status: ExamAttemptStatus;
    startedAt: Date;
    expiresAt: Date;
    submittedAt: Date | null;
    totalScore: number;
  };
  finalScore: number;
  submissionReports: Array<{
    problemId: string;
    submissionId: string;
    code: string;
    language: string;
    passedTestcases: number;
    totalTestcases: number;
    executionTime: number | null;
    memory: number | null;
    createdAt: Date;
    isSuccessful: boolean;
    status: string;
  }>;
  ranking: {
    currentStudent:
      | {
          rank: number;
          studentId: string;
          studentName: string;
          studentEmail: string;
          totalScore: number;
          submittedAt: Date | null;
        }
      | undefined;
    allRankings: Array<{
      rank: number;
      studentId: string;
      studentName: string;
      studentEmail: string;
      totalScore: number;
      submittedAt: Date | null;
    }>;
  };
};