-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TEACHER', 'STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "expectedComplexity" AS ENUM ('LOGN', 'N', 'NLOGN', 'N2', 'N3', 'EXP');

-- CreateEnum
CREATE TYPE "problemDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "submissionStatus" AS ENUM ('ACCEPTED', 'BAD_SCALING', 'BAD_ALGORITHM');

-- CreateEnum
CREATE TYPE "GeneratorType" AS ENUM ('ARRAY', 'STRING', 'MATRIX');

-- CreateEnum
CREATE TYPE "GeneratorPattern" AS ENUM ('RANDOM', 'SORTED', 'REVERSE', 'CONSTANT');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('scheduled', 'active', 'completed', 'ai_processing', 'finished');

-- CreateEnum
CREATE TYPE "AiProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'RUNNING', 'ACCEPTED', 'PARTIAL', 'WRONG_ANSWER', 'TIME_LIMIT', 'MEMORY_LIMIT', 'RUNTIME_ERROR', 'COMPILE_ERROR', 'INTERNAL_ERROR');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "groupType" AS ENUM ('CLASS', 'LAB');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('GROUP', 'DEPARTMENT', 'ORGANIZATION', 'PLATFORM');

-- CreateEnum
CREATE TYPE "AIRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole",
    "isOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "difficulty" "problemDifficulty" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Unknown',

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "cases" JSONB NOT NULL,
    "problemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complexityTestingCases" (
    "id" TEXT NOT NULL,
    "cases" JSONB NOT NULL,
    "expectedComplexity" "expectedComplexity",
    "problemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complexityTestingCases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driverCode" (
    "id" TEXT NOT NULL,
    "languageId" INTEGER NOT NULL,
    "header" TEXT,
    "template" TEXT,
    "footer" TEXT,
    "problemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driverCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referenceSolution" (
    "id" TEXT NOT NULL,
    "languageId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,

    CONSTRAINT "referenceSolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunTestCase" (
    "id" TEXT NOT NULL,
    "cases" JSONB NOT NULL,
    "problemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selfSubmission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "noOfPassedCases" INTEGER NOT NULL,
    "failedCase" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "submissionStatus" NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,

    CONSTRAINT "selfSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemTestGenerator" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "type" "GeneratorType" NOT NULL,
    "pattern" "GeneratorPattern" NOT NULL,
    "minValue" INTEGER NOT NULL,
    "maxValue" INTEGER NOT NULL,
    "expectedComplexity" "expectedComplexity" NOT NULL,
    "sizes" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemTestGenerator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "durationMin" INTEGER NOT NULL,
    "sebEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExamStatus" NOT NULL,
    "creatorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamProblem" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "examId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,

    CONSTRAINT "ExamProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamEnrollment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ExamEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "passedTestcases" INTEGER NOT NULL DEFAULT 0,
    "totalTestcases" INTEGER NOT NULL DEFAULT 0,
    "executionTime" DOUBLE PRECISION,
    "memory" DOUBLE PRECISION,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "aiQueued" BOOLEAN NOT NULL DEFAULT false,
    "aiStatus" "AiProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "status" "SubmissionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "examId" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamResult" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamGroup" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "ExamGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
    "disconnectCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "totalScore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvaluation" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "timeComplexity" TEXT,
    "spaceComplexity" TEXT,
    "optimal" BOOLEAN,
    "qualityScore" INTEGER,
    "aiScore" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT,

    CONSTRAINT "AiEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" TEXT NOT NULL,
    "noOfMembers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinByLink" BOOLEAN NOT NULL DEFAULT true,
    "type" "groupType" NOT NULL DEFAULT 'CLASS',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiMaxMessages" INTEGER,
    "aiMaxTokens" INTEGER,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemTag" (
    "problemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ProblemTag_pkey" PRIMARY KEY ("problemId","tagId")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AIRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "modelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRateLimit" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "lastRequest" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupOverallStats" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "totalExams" INTEGER NOT NULL,
    "totalStudents" INTEGER NOT NULL,
    "avgScoreAllExams" DOUBLE PRECISION NOT NULL,
    "overallPassRate" DOUBLE PRECISION NOT NULL,
    "highestExamAvg" DOUBLE PRECISION NOT NULL,
    "lowestExamAvg" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupOverallStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentOverallStats" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "totalExams" INTEGER NOT NULL,
    "avgScore" DOUBLE PRECISION NOT NULL,
    "totalAttempts" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentOverallStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupProblemStats" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "totalStudents" INTEGER NOT NULL,
    "attemptedCount" INTEGER NOT NULL,
    "acceptedCount" INTEGER NOT NULL,
    "totalAttempts" INTEGER NOT NULL,
    "avgRuntime" DOUBLE PRECISION NOT NULL,
    "avgMemory" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupProblemStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProblemStats" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "solved" BOOLEAN NOT NULL,

    CONSTRAINT "StudentProblemStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_id_idx" ON "session"("id");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_number_key" ON "Problem"("number");

-- CreateIndex
CREATE INDEX "Problem_id_number_title_idx" ON "Problem"("id", "number", "title");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_problemId_key" ON "TestCase"("problemId");

-- CreateIndex
CREATE INDEX "TestCase_problemId_idx" ON "TestCase"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "complexityTestingCases_problemId_key" ON "complexityTestingCases"("problemId");

-- CreateIndex
CREATE INDEX "complexityTestingCases_problemId_idx" ON "complexityTestingCases"("problemId");

-- CreateIndex
CREATE INDEX "driverCode_problemId_idx" ON "driverCode"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "driverCode_languageId_problemId_key" ON "driverCode"("languageId", "problemId");

-- CreateIndex
CREATE UNIQUE INDEX "RunTestCase_problemId_key" ON "RunTestCase"("problemId");

-- CreateIndex
CREATE INDEX "RunTestCase_problemId_idx" ON "RunTestCase"("problemId");

-- CreateIndex
CREATE INDEX "selfSubmission_userId_idx" ON "selfSubmission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemTestGenerator_problemId_key" ON "ProblemTestGenerator"("problemId");

-- CreateIndex
CREATE INDEX "ProblemTestGenerator_problemId_idx" ON "ProblemTestGenerator"("problemId");

-- CreateIndex
CREATE INDEX "Exam_id_creatorId_idx" ON "Exam"("id", "creatorId");

-- CreateIndex
CREATE INDEX "ExamProblem_examId_idx" ON "ExamProblem"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamEnrollment_examId_userId_key" ON "ExamEnrollment"("examId", "userId");

-- CreateIndex
CREATE INDEX "Submission_userId_examId_idx" ON "Submission"("userId", "examId");

-- CreateIndex
CREATE INDEX "ExamResult_examId_userId_idx" ON "ExamResult"("examId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamGroup_examId_groupId_key" ON "ExamGroup"("examId", "groupId");

-- CreateIndex
CREATE INDEX "ExamAttempt_examId_studentId_idx" ON "ExamAttempt"("examId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_examId_studentId_key" ON "ExamAttempt"("examId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluation_submissionId_key" ON "AiEvaluation"("submissionId");

-- CreateIndex
CREATE INDEX "AiEvaluation_submissionId_idx" ON "AiEvaluation"("submissionId");

-- CreateIndex
CREATE INDEX "Group_creatorId_idx" ON "Group"("creatorId");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_userId_idx" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AIConversation_studentId_examId_problemId_key" ON "AIConversation"("studentId", "examId", "problemId");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "AIRateLimit_studentId_problemId_key" ON "AIRateLimit"("studentId", "problemId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupOverallStats_groupId_key" ON "GroupOverallStats"("groupId");

-- CreateIndex
CREATE INDEX "GroupOverallStats_groupId_idx" ON "GroupOverallStats"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentOverallStats_studentId_key" ON "StudentOverallStats"("studentId");

-- CreateIndex
CREATE INDEX "StudentOverallStats_groupId_idx" ON "StudentOverallStats"("groupId");

-- CreateIndex
CREATE INDEX "StudentOverallStats_studentId_idx" ON "StudentOverallStats"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentOverallStats_groupId_studentId_key" ON "StudentOverallStats"("groupId", "studentId");

-- CreateIndex
CREATE INDEX "GroupProblemStats_groupId_problemId_idx" ON "GroupProblemStats"("groupId", "problemId");

-- CreateIndex
CREATE INDEX "GroupProblemStats_problemId_idx" ON "GroupProblemStats"("problemId");

-- CreateIndex
CREATE INDEX "GroupProblemStats_groupId_idx" ON "GroupProblemStats"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupProblemStats_groupId_problemId_key" ON "GroupProblemStats"("groupId", "problemId");

-- CreateIndex
CREATE INDEX "StudentProblemStats_studentId_problemId_idx" ON "StudentProblemStats"("studentId", "problemId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProblemStats_studentId_problemId_groupId_key" ON "StudentProblemStats"("studentId", "problemId", "groupId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complexityTestingCases" ADD CONSTRAINT "complexityTestingCases_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driverCode" ADD CONSTRAINT "driverCode_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referenceSolution" ADD CONSTRAINT "referenceSolution_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunTestCase" ADD CONSTRAINT "RunTestCase_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selfSubmission" ADD CONSTRAINT "selfSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selfSubmission" ADD CONSTRAINT "selfSubmission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTestGenerator" ADD CONSTRAINT "ProblemTestGenerator_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamProblem" ADD CONSTRAINT "ExamProblem_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamProblem" ADD CONSTRAINT "ExamProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamEnrollment" ADD CONSTRAINT "ExamEnrollment_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamEnrollment" ADD CONSTRAINT "ExamEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamGroup" ADD CONSTRAINT "ExamGroup_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamGroup" ADD CONSTRAINT "ExamGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluation" ADD CONSTRAINT "AiEvaluation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluation" ADD CONSTRAINT "AiEvaluation_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTag" ADD CONSTRAINT "ProblemTag_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTag" ADD CONSTRAINT "ProblemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRateLimit" ADD CONSTRAINT "AIRateLimit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRateLimit" ADD CONSTRAINT "AIRateLimit_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOverallStats" ADD CONSTRAINT "GroupOverallStats_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentOverallStats" ADD CONSTRAINT "StudentOverallStats_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentOverallStats" ADD CONSTRAINT "StudentOverallStats_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupProblemStats" ADD CONSTRAINT "GroupProblemStats_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupProblemStats" ADD CONSTRAINT "GroupProblemStats_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProblemStats" ADD CONSTRAINT "StudentProblemStats_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProblemStats" ADD CONSTRAINT "StudentProblemStats_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProblemStats" ADD CONSTRAINT "StudentProblemStats_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
