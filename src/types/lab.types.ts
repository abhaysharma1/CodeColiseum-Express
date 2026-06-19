export interface LabWithModulesCount {
  id: string;
  title: string;
  description: string | null;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  modulesCount: number;
}

export interface LabAssignmentSummary {
  labId: string;
  assignedGroups: { groupId: string; groupName: string }[];
  totalAssigned: number;
}

export interface ModuleWithProblemCount {
  id: string;
  title: string;
  description: string | null;
  labId: string;
  weekNumber: number;
  orderIndex: number | null;
  unlockAt: Date | null;
  dueAt: Date | null;
  assessmentExamId: string | null;
  createdAt: Date;
  updatedAt: Date;
  problemsCount: number;
}

export interface ModuleProblemWithMeta {
  id: string;
  moduleId: string;
  problemId: string;
  orderIndex: number | null;
  problem: {
    id: string;
    number: number;
    title: string;
    difficulty: string;
  };
}

export interface StudentModuleProblem extends ModuleProblemWithMeta {
  progress: {
    attemptCount: number;
    isSolved: boolean;
    lastAttemptAt: Date | null;
  } | null;
}

export interface AssessmentDTO {
  examId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  status: "UPCOMING" | "ACTIVE" | "COMPLETED";
}

export interface AssessmentResultsDTO {
  totalStudents: number;
  attemptedStudents: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
}

export type ModuleStatus = "LOCKED" | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface ModuleProgressDTO {
  moduleId: string;
  completedProblems: number;
  totalProblems: number;
  completionPercentage: number;
  moduleStatus: ModuleStatus;
}

export interface StudentProgressEntry {
  studentId: string;
  studentName: string;
  solvedProblems: number;
  totalProblems: number;
  completionPercentage: number;
}

export interface ProblemAnalyticsEntry {
  problemId: string;
  problemNumber: number;
  problemTitle: string;
  attemptedStudents: number;
  solvedStudents: number;
  solveRate: number;
  averageAttempts: number;
}

export type ModuleProblemAccessStatus = "LOCKED" | "AVAILABLE" | "NOT_YET_AVAILABLE" | "EXPIRED";

export interface ModuleProblemAccessConfig {
  isUnlocked: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
}

export interface ProgressResponse {
  problems: {
    moduleProblemId: string;
    attemptCount: number;
    isSolved: boolean;
    lastAttemptAt: Date | null;
  }[];
}
