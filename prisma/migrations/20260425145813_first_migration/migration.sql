/*
  Warnings:

  - You are about to drop the column `languageId` on the `driverCode` table. All the data in the column will be lost.
  - You are about to drop the column `languageId` on the `referenceSolution` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `selfSubmission` table. All the data in the column will be lost.
  - You are about to drop the column `failedCase` on the `selfSubmission` table. All the data in the column will be lost.
  - You are about to drop the column `noOfPassedCases` on the `selfSubmission` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[language,problemId]` on the table `driverCode` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `language` to the `driverCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `language` to the `referenceSolution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sourceCode` to the `selfSubmission` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProgrammingLanguage" AS ENUM ('c', 'cpp', 'python', 'java');

-- DropIndex
DROP INDEX "driverCode_languageId_problemId_key";

-- AlterTable
ALTER TABLE "ExamAnalytics" ALTER COLUMN "scoreDistribution" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "problemDifficulties" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "OrganizationAnalytics" ALTER COLUMN "weakestProblemIds" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "hardestProblemIds" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "scoreDistribution" SET DEFAULT '{}'::jsonb,
ALTER COLUMN "performanceTrend" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudentOverallStats" ALTER COLUMN "strongTopics" SET DEFAULT '[]'::jsonb,
ALTER COLUMN "weakTopics" SET DEFAULT '[]'::jsonb;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "stderr" TEXT;

-- AlterTable
ALTER TABLE "driverCode" DROP COLUMN "languageId",
ADD COLUMN     "language" "ProgrammingLanguage" NOT NULL;

-- AlterTable
ALTER TABLE "referenceSolution" DROP COLUMN "languageId",
ADD COLUMN     "language" "ProgrammingLanguage" NOT NULL;

-- AlterTable
ALTER TABLE "selfSubmission" DROP COLUMN "code",
DROP COLUMN "failedCase",
DROP COLUMN "noOfPassedCases",
ADD COLUMN     "executionTime" DOUBLE PRECISION,
ADD COLUMN     "memory" DOUBLE PRECISION,
ADD COLUMN     "passedTestcases" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceCode" TEXT NOT NULL,
ADD COLUMN     "stderr" TEXT,
ADD COLUMN     "totalTestcases" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "sebVerified" BOOLEAN NOT NULL DEFAULT false,
    "sebHash" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamSession_token_key" ON "ExamSession"("token");

-- CreateIndex
CREATE INDEX "ExamSession_token_idx" ON "ExamSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "driverCode_language_problemId_key" ON "driverCode"("language", "problemId");

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
