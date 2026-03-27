-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('EXAM', 'ANNOUNCEMENT', 'SYSTEM', 'REMINDER');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

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
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" TEXT NOT NULL,
    "groupId" TEXT,
    "examId" TEXT,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_groupId_idx" ON "Notification"("groupId");

-- CreateIndex
CREATE INDEX "Notification_examId_idx" ON "Notification"("examId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_isRead_idx" ON "NotificationRecipient"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_key" ON "NotificationRecipient"("notificationId", "userId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
