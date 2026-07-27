/*
  Warnings:

  - You are about to drop the column `isRedeemed` on the `ActivationCode` table. All the data in the column will be lost.
  - The primary key for the `CourseInstructor` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `CourseInstructor` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `CourseInstructor` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `CourseInstructor` table. All the data in the column will be lost.
  - You are about to drop the column `passingScore` on the `Exam` table. All the data in the column will be lost.
  - You are about to drop the column `isGraded` on the `ExamAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `isPassed` on the `ExamAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `passingScore` on the `Quiz` table. All the data in the column will be lost.
  - You are about to drop the column `isPassed` on the `QuizAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `selectedAnswerId` on the `StudentExamResponse` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `StudentLectureAccess` table. All the data in the column will be lost.
  - You are about to drop the `Answer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExamAnswer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Homework` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `HomeworkSubmission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Question` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "NotificationEventCategory" AS ENUM ('QUIZ_FAILED', 'EXAM_FAILED', 'LECTURE_EXPIRED', 'RISK_ALERT');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "CodeStatus" AS ENUM ('UNUSED', 'REDEEMED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('HOMEWORK', 'PDF', 'SHEET', 'REFERENCE', 'ASSIGNMENT', 'OTHER');

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'READ_ONLY_TEXT';

-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "CourseInstructor" DROP CONSTRAINT "CourseInstructor_instructorId_fkey";

-- DropForeignKey
ALTER TABLE "ExamAnswer" DROP CONSTRAINT "ExamAnswer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Homework" DROP CONSTRAINT "Homework_lectureId_fkey";

-- DropForeignKey
ALTER TABLE "HomeworkSubmission" DROP CONSTRAINT "HomeworkSubmission_homeworkId_fkey";

-- DropForeignKey
ALTER TABLE "HomeworkSubmission" DROP CONSTRAINT "HomeworkSubmission_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_quizId_fkey";

-- DropForeignKey
ALTER TABLE "StudentExamResponse" DROP CONSTRAINT "StudentExamResponse_selectedAnswerId_fkey";

-- DropIndex
DROP INDEX "CourseInstructor_courseId_instructorId_key";

-- AlterTable
ALTER TABLE "ActivationCode" DROP COLUMN "isRedeemed",
ADD COLUMN     "status" "CodeStatus" NOT NULL DEFAULT 'UNUSED';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "audienceType" "EducationLevel" NOT NULL DEFAULT 'HIGH_SCHOOL',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "introductoryVideoUrl" TEXT,
ADD COLUMN     "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "CourseInstructor" DROP CONSTRAINT "CourseInstructor_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "id",
DROP COLUMN "updatedAt",
ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "CourseInstructor_pkey" PRIMARY KEY ("courseId", "instructorId");

-- AlterTable
ALTER TABLE "Exam" DROP COLUMN "passingScore",
ADD COLUMN     "chapterId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "passGrade" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "ExamAttempt" DROP COLUMN "isGraded",
DROP COLUMN "isPassed",
ADD COLUMN     "status" "AttemptStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ExamQuestion" ADD COLUMN     "correctOptionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "options" TEXT[],
ADD COLUMN     "referenceAnswer" TEXT;

-- AlterTable
ALTER TABLE "Lecture" ADD COLUMN     "chapterId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "durationDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warningHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warningMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Quiz" DROP COLUMN "passingScore",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passGrade" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "QuizAttempt" DROP COLUMN "isPassed",
ADD COLUMN     "status" "AttemptStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "score" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StudentExamResponse" DROP COLUMN "selectedAnswerId",
ADD COLUMN     "aiConfidenceScore" DOUBLE PRECISION,
ADD COLUMN     "aiScoreGuess" DOUBLE PRECISION,
ADD COLUMN     "evaluationNote" TEXT,
ADD COLUMN     "instructorOverrideScore" DOUBLE PRECISION,
ADD COLUMN     "selectedOptionIndex" INTEGER;

-- AlterTable
ALTER TABLE "StudentLectureAccess" DROP COLUMN "startedAt",
ADD COLUMN     "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "Answer";

-- DropTable
DROP TABLE "ExamAnswer";

-- DropTable
DROP TABLE "Homework";

-- DropTable
DROP TABLE "HomeworkSubmission";

-- DropTable
DROP TABLE "Question";

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterAttachment" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAttachment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
    "options" TEXT[],
    "correctOptionIndex" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "featureUsed" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL DEFAULT 'OTHER',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "browser" TEXT,
    "ipAddress" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentRiskProfile" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "runningAverageScore" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "isAtRisk" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentRiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentNotificationLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentPhoneNumber" TEXT NOT NULL,
    "eventCategory" "NotificationEventCategory" NOT NULL,
    "channelType" "NotificationChannelType" NOT NULL,
    "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "messageContent" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorNote" TEXT,

    CONSTRAINT "ParentNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chapter_courseId_idx" ON "Chapter"("courseId");

-- CreateIndex
CREATE INDEX "ChapterAttachment_chapterId_idx" ON "ChapterAttachment"("chapterId");

-- CreateIndex
CREATE INDEX "CourseAttachment_courseId_idx" ON "CourseAttachment"("courseId");

-- CreateIndex
CREATE INDEX "AiUsageLog_instructorId_idx" ON "AiUsageLog"("instructorId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "Attachment_lectureId_idx" ON "Attachment"("lectureId");

-- CreateIndex
CREATE INDEX "DeviceSession_studentId_idx" ON "DeviceSession"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_studentId_deviceFingerprint_key" ON "DeviceSession"("studentId", "deviceFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "StudentRiskProfile_studentId_key" ON "StudentRiskProfile"("studentId");

-- CreateIndex
CREATE INDEX "SystemAuditLog_actorId_idx" ON "SystemAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "SystemAuditLog_createdAt_idx" ON "SystemAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterAttachment" ADD CONSTRAINT "ChapterAttachment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAttachment" ADD CONSTRAINT "CourseAttachment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lecture" ADD CONSTRAINT "Lecture_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseInstructor" ADD CONSTRAINT "CourseInstructor_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "Lecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentRiskProfile" ADD CONSTRAINT "StudentRiskProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentNotificationLog" ADD CONSTRAINT "ParentNotificationLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAuditLog" ADD CONSTRAINT "SystemAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
