/*
  Warnings:

  - Added the required column `updatedAt` to the `StudentProblemStats` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GroupOverallStats" ADD COLUMN     "activeStudents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "avgTimePerStudent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "hardestProblemId" TEXT,
ADD COLUMN     "totalTimeSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "weakestProblemId" TEXT;

-- AlterTable
ALTER TABLE "GroupProblemStats" ADD COLUMN     "avgTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "difficultyTier" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "failureRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StudentOverallStats" ADD COLUMN     "avgAttemptsPerProblem" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "avgTimePerProblem" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "completionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastActive" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "scoreTrend" TEXT NOT NULL DEFAULT 'stable',
ADD COLUMN     "scoreTrendValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "strongTopics" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN     "totalTimeSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "weakTopics" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "StudentProblemStats" ADD COLUMN     "avgTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "firstAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isWeak" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "OrganizationAnalytics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "totalGroups" INTEGER NOT NULL DEFAULT 0,
    "activeGroups" INTEGER NOT NULL DEFAULT 0,
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "activeStudents" INTEGER NOT NULL DEFAULT 0,
    "avgScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallPassRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalProblems" INTEGER NOT NULL DEFAULT 0,
    "weakestProblemIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "hardestProblemIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "avgTimePerStudent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTimeSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoreDistribution" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "performanceTrend" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "participationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSubmissionsPerStudent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAnalytics" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "totalEnrolled" INTEGER NOT NULL DEFAULT 0,
    "totalAttempted" INTEGER NOT NULL DEFAULT 0,
    "totalCompleted" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "highestScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lowestScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medianScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoreDistribution" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "problemDifficulties" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "avgTimeToComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgAttempts" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "totalSubmissions" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "partialCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationAnalytics_organizationId_idx" ON "OrganizationAnalytics"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationAnalytics_updatedAt_idx" ON "OrganizationAnalytics"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationAnalytics_organizationId_key" ON "OrganizationAnalytics"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAnalytics_examId_key" ON "ExamAnalytics"("examId");

-- CreateIndex
CREATE INDEX "ExamAnalytics_examId_idx" ON "ExamAnalytics"("examId");

-- CreateIndex
CREATE INDEX "ExamAnalytics_updatedAt_idx" ON "ExamAnalytics"("updatedAt");

-- CreateIndex
CREATE INDEX "GroupOverallStats_createdAt_idx" ON "GroupOverallStats"("createdAt");

-- CreateIndex
CREATE INDEX "GroupOverallStats_avgScoreAllExams_groupId_idx" ON "GroupOverallStats"("avgScoreAllExams", "groupId");

-- CreateIndex
CREATE INDEX "GroupProblemStats_successRate_groupId_idx" ON "GroupProblemStats"("successRate", "groupId");

-- CreateIndex
CREATE INDEX "StudentOverallStats_avgScore_groupId_idx" ON "StudentOverallStats"("avgScore", "groupId");

-- CreateIndex
CREATE INDEX "StudentOverallStats_lastActive_groupId_idx" ON "StudentOverallStats"("lastActive", "groupId");

-- CreateIndex
CREATE INDEX "StudentProblemStats_studentId_isWeak_idx" ON "StudentProblemStats"("studentId", "isWeak");

-- AddForeignKey
ALTER TABLE "ExamAnalytics" ADD CONSTRAINT "ExamAnalytics_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
