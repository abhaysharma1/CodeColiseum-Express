-- AlterTable
ALTER TABLE "ExamAnalytics" ALTER COLUMN "scoreDistribution" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "problemDifficulties" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "OrganizationAnalytics" ALTER COLUMN "weakestProblemIds" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "hardestProblemIds" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoreDistribution" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "performanceTrend" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "StudentOverallStats" ALTER COLUMN "strongTopics" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "weakTopics" SET DEFAULT '[]'::jsonb;

-- CreateTable
CREATE TABLE "GroupExamAnalytics" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
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

    CONSTRAINT "GroupExamAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupExamAnalytics_groupId_idx" ON "GroupExamAnalytics"("groupId");

-- CreateIndex
CREATE INDEX "GroupExamAnalytics_examId_idx" ON "GroupExamAnalytics"("examId");

-- CreateIndex
CREATE INDEX "GroupExamAnalytics_updatedAt_idx" ON "GroupExamAnalytics"("updatedAt");

-- CreateIndex
CREATE INDEX "GroupExamAnalytics_groupId_updatedAt_idx" ON "GroupExamAnalytics"("groupId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupExamAnalytics_groupId_examId_key" ON "GroupExamAnalytics"("groupId", "examId");

-- AddForeignKey
ALTER TABLE "GroupExamAnalytics" ADD CONSTRAINT "GroupExamAnalytics_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupExamAnalytics" ADD CONSTRAINT "GroupExamAnalytics_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
